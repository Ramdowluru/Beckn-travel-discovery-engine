import unittest
from unittest.mock import AsyncMock

from bson import ObjectId

from app.repositories.transport_selections import TransportSelectionRepository


class TransportSelectionRepositoryTests(unittest.IsolatedAsyncioTestCase):
    def _repository(self):
        repository = object.__new__(TransportSelectionRepository)
        repository._collection = AsyncMock()
        repository._status_actions = AsyncMock()
        return repository

    async def test_claim_dispatch_returns_claimed_attempt(self):
        repository = self._repository()
        claimed = {"selectionId": "selection-1", "state": "SELECT_REQUESTED", "dispatching": True}
        repository._collection.find_one_and_update.return_value = claimed

        result = await repository.claim_dispatch("selection-1", ObjectId())

        self.assertEqual(result, claimed)
        repository._collection.find_one_and_update.assert_awaited_once()

    async def test_update_result_can_compare_state_atomically(self):
        repository = self._repository()

        await repository.update_result(
            selection_id="selection-1",
            user_id=ObjectId(),
            state="PENDING_PROVIDER",
            quote=None,
            expected_states=["SELECT_REQUESTED"],
        )

        query = repository._collection.find_one_and_update.await_args.args[0]
        self.assertEqual(query["state"], {"$in": ["SELECT_REQUESTED"]})

    async def test_confirm_state_updates_are_guarded_against_stale_outcomes(self):
        repository = self._repository()
        user_id = ObjectId()

        await repository.update_confirm(
            selection_id="selection-1",
            user_id=user_id,
            state="PENDING_PROVIDER",
            error="Provider outcome is unknown.",
            expected_states=["CONFIRM_REQUESTED"],
        )

        query = repository._collection.find_one_and_update.await_args.args[0]
        self.assertEqual(query["selectionId"], "selection-1")
        self.assertEqual(query["userId"], user_id)
        self.assertEqual(query["confirmState"], {"$in": ["CONFIRM_REQUESTED"]})

    async def test_reinit_reset_archives_provider_order_and_clears_confirm_state(self):
        repository = self._repository()
        user_id = ObjectId()
        previous = {
            "selectionId": "selection-1",
            "userId": user_id,
            "state": "INITIALIZED",
            "initMessageId": "init-old",
            "providerOrder": {"id": "provider-order-old"},
        }
        repository._collection.find_one.return_value = previous
        repository._collection.find_one_and_update.return_value = {
            "selectionId": "selection-1",
            "state": "SELECTED",
        }

        result = await repository.reset_initialized_for_reinit("selection-1", user_id)

        self.assertEqual(result["state"], "SELECTED")
        query = repository._collection.find_one_and_update.await_args.args[0]
        update = repository._collection.find_one_and_update.await_args.args[1]
        self.assertEqual(query["confirmState"], {
            "$nin": ["CONFIRMED", "CONFIRM_REQUESTED", "PENDING_PROVIDER"],
        })
        self.assertEqual(update["$set"]["state"], "SELECTED")
        self.assertIn("confirmBusinessKey", update["$unset"])
        history = update["$push"]["initActionHistory"]
        self.assertEqual(history["messageId"], "init-old")
        self.assertEqual(history["providerOrderId"], "provider-order-old")
        self.assertEqual(history["state"], "REPLACED")

    async def test_reinit_reset_is_denied_when_confirmation_is_active(self):
        repository = self._repository()
        repository._collection.find_one.return_value = {
            "selectionId": "selection-1",
            "state": "INITIALIZED",
            "confirmState": "CONFIRM_REQUESTED",
        }
        repository._collection.find_one_and_update.return_value = None

        result = await repository.reset_initialized_for_reinit("selection-1", ObjectId())

        self.assertIsNone(result)

    async def test_provider_order_identity_is_unique_within_trusted_bpp(self):
        repository = self._repository()

        await repository.ensure_indexes()

        index_calls = repository._collection.create_index.await_args_list
        provider_order_index = next(
            call for call in index_calls
            if call.kwargs.get("name") == "transport_provider_order_unique"
        )
        self.assertEqual(
            provider_order_index.args[0],
            [("provider.id", 1), ("providerOrder.id", 1)],
        )
        self.assertTrue(provider_order_index.kwargs["unique"])
        self.assertEqual(
            provider_order_index.kwargs["partialFilterExpression"],
            {"providerOrder.id": {"$type": "string"}},
        )
        status_indexes = repository._status_actions.create_index.await_args_list
        correlation_index = next(
            call for call in status_indexes
            if call.kwargs.get("name") == "booking_status_correlation_unique"
        )
        self.assertEqual(correlation_index.args[0], [("transactionId", 1), ("messageId", 1)])
        self.assertTrue(correlation_index.kwargs["unique"])

    async def test_cancel_business_key_and_correlation_are_unique(self):
        repository = self._repository()

        await repository.ensure_indexes()

        calls = repository._collection.create_index.await_args_list
        business = next(call for call in calls if call.kwargs.get("name") == "transport_cancel_business_key_unique")
        correlation = next(call for call in calls if call.kwargs.get("name") == "transport_cancel_correlation_unique")
        self.assertTrue(business.kwargs["unique"])
        self.assertEqual(business.args[0], [("userId", 1), ("cancelBusinessKey", 1)])
        self.assertTrue(correlation.kwargs["unique"])
        self.assertEqual(correlation.args[0], [("transactionId", 1), ("cancelMessageId", 1)])

    async def test_begin_cancel_requires_confirmed_user_owned_attempt_and_persists_reason(self):
        repository = self._repository()
        user_id = ObjectId()
        created = {"selectionId": "selection-1", "cancelState": "CANCEL_REQUESTED"}
        repository._collection.find_one.return_value = None
        repository._collection.find_one_and_update.return_value = created

        result = await repository.begin_cancel(
            selection_id="selection-1",
            user_id=user_id,
            business_key="cancel-key",
            message_id="cancel-message",
            reason="Plans changed",
        )

        self.assertEqual(result, created)
        query = repository._collection.find_one_and_update.await_args.args[0]
        fields = repository._collection.find_one_and_update.await_args.args[1]["$set"]
        self.assertEqual(query["userId"], user_id)
        self.assertEqual(query["state"], "CONFIRMED")
        self.assertEqual(query["confirmState"], "CONFIRMED")
        self.assertEqual(fields["cancelBusinessKey"], "cancel-key")
        self.assertEqual(fields["cancelMessageId"], "cancel-message")
        self.assertEqual(fields["cancelReason"], "Plans changed")

    async def test_cancel_state_updates_are_guarded_and_terminal_success_marks_order_cancelled(self):
        repository = self._repository()

        await repository.update_cancel(
            selection_id="selection-1",
            user_id=ObjectId(),
            state="CANCELLED",
            response={"message": {"order": {"state": "CANCELLED"}}},
            expected_states=["CANCEL_REQUESTED", "PENDING_PROVIDER"],
            source="ON_CANCEL",
        )

        query, update = repository._collection.find_one_and_update.await_args.args
        self.assertEqual(query["cancelState"], {"$in": ["CANCEL_REQUESTED", "PENDING_PROVIDER"]})
        self.assertEqual(update["$set"]["cancelState"], "CANCELLED")
        self.assertEqual(update["$set"]["state"], "CANCELLED")
        self.assertEqual(update["$set"]["cancelSource"], "ON_CANCEL")
        self.assertIn("cancelledProviderResponse", update["$set"])
