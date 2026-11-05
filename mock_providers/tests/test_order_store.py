import os
import tempfile
import unittest
from unittest.mock import patch

from common.order_store import get_initialized_order, save_initialized_order


class ProviderOrderStoreTests(unittest.TestCase):
    def test_initialized_order_is_persisted_by_provider(self):
        order = {
            "id": "order-test-1",
            "state": "INITIALIZED",
            "items": [{"id": "item-1"}],
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"MOCK_PROVIDER_STATE_DIR": directory}):
                save_initialized_order("provider.test", "transaction-1", "message-1", order)
                self.assertEqual(get_initialized_order("provider.test", "order-test-1"), order)
                self.assertIsNone(get_initialized_order("provider.test", "other-order"))

    def test_replaced_initialization_keeps_unique_order_id(self):
        first = {"id": "order-tx-msg1-item", "state": "INITIALIZED", "items": [{"id": "item-1"}]}
        second = {"id": "order-tx-msg2-item", "state": "INITIALIZED", "items": [{"id": "item-1"}]}
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"MOCK_PROVIDER_STATE_DIR": directory}):
                save_initialized_order("provider.test", "transaction-1", "message-1", first)
                save_initialized_order("provider.test", "transaction-1", "message-2", second)
                self.assertEqual(get_initialized_order("provider.test", first["id"]), first)
                self.assertEqual(get_initialized_order("provider.test", second["id"]), second)
