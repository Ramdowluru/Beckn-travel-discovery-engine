import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import typescript from "typescript";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendModulePath = pathToFileURL(resolve(frontendRoot, "lib/serverBackend.ts")).href;
process.env.BACKEND_URL = "http://backend.test";

async function loadTypeScriptModule(path, replacements = []) {
  let source = await readFile(path, "utf8");
  for (const [pattern, value] of replacements) {
    source = source.replaceAll(pattern, value);
  }
  const { outputText, diagnostics } = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      target: typescript.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error);
  assert.deepEqual(errors, []);
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

async function loadRoute(path) {
  return loadTypeScriptModule(path, [
    ['"@/lib/serverBackend"', JSON.stringify(backendModulePath)],
  ]);
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("trip collection BFF routes forward GET and POST with session and CSRF context", async () => {
  const route = await loadRoute(resolve(frontendRoot, "app/api/trips/route.ts"));
  const forwarded = [];
  const restore = installFetchMock(async (url, init) => {
    forwarded.push({ url: String(url), init });
    return Response.json({ id: "trip-1" }, { status: 201 });
  });

  try {
    const getResponse = await route.GET(new Request("http://frontend.test/api/trips", {
      headers: {
        cookie: "tde_session=session-token; tde_csrf=csrf-token",
        origin: "http://frontend.test",
      },
    }));
    assert.equal(getResponse.status, 201);
    await route.POST(new Request("http://frontend.test/api/trips", {
      method: "POST",
      headers: {
        cookie: "tde_session=session-token; tde_csrf=csrf-token",
        origin: "http://frontend.test",
        "x-csrf-token": "csrf-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "City break" }),
    }));

    assert.deepEqual(forwarded.map(({ url, init }) => [url, init.method]), [
      ["http://backend.test/api/trips", "GET"],
      ["http://backend.test/api/trips", "POST"],
    ]);
    assert.equal(forwarded[0].init.headers.get("cookie"), "tde_session=session-token; tde_csrf=csrf-token");
    assert.equal(forwarded[0].init.headers.get("origin"), "http://frontend.test");
    assert.equal(forwarded[1].init.headers.get("x-csrf-token"), "csrf-token");
    assert.equal(forwarded[1].init.body, JSON.stringify({ title: "City break" }));
    assert.equal(forwarded[1].init.cache, "no-store");
  } finally {
    restore();
  }
});

test("trip detail and booking membership routes forward encoded identifiers and methods", async () => {
  const detailRoute = await loadRoute(resolve(frontendRoot, "app/api/trips/[id]/route.ts"));
  const membershipRoute = await loadRoute(
    resolve(frontendRoot, "app/api/trips/[id]/bookings/[bookingId]/route.ts"),
  );
  const forwarded = [];
  const restore = installFetchMock(async (url, init) => {
    forwarded.push({ url: String(url), init });
    return Response.json({ detail: "Trip not found" }, { status: 404 });
  });

  try {
    const context = { params: Promise.resolve({ id: "trip/one" }) };
    const notFound = await detailRoute.GET(new Request("http://frontend.test"), context);
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), { detail: "Trip not found" });
    await detailRoute.PATCH(new Request("http://frontend.test", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
    }), context);
    const memberContext = { params: Promise.resolve({ id: "trip/one", bookingId: "booking two" }) };
    await membershipRoute.PUT(new Request("http://frontend.test", { method: "PUT" }), memberContext);
    await membershipRoute.DELETE(new Request("http://frontend.test", { method: "DELETE" }), memberContext);

    assert.deepEqual(forwarded.map(({ url, init }) => [url, init.method]), [
      ["http://backend.test/api/trips/trip%2Fone", "GET"],
      ["http://backend.test/api/trips/trip%2Fone", "PATCH"],
      ["http://backend.test/api/trips/trip%2Fone/bookings/booking%20two", "PUT"],
      ["http://backend.test/api/trips/trip%2Fone/bookings/booking%20two", "DELETE"],
    ]);
    assert.equal(forwarded[1].init.body, JSON.stringify({ title: "Updated" }));
    assert.equal(notFound.headers.get("cache-control"), "no-store");
  } finally {
    restore();
  }
});

test("trip forwarding preserves authentication errors and reports backend outages", async () => {
  const route = await loadRoute(resolve(frontendRoot, "app/api/trips/route.ts"));
  const forwarded = [];
  const restore = installFetchMock(async (url, init) => {
    forwarded.push({ url: String(url), init });
    if (forwarded.length === 1) {
      return Response.json({ detail: "Authentication is required." }, { status: 401 });
    }
    throw new Error("backend offline");
  });

  try {
    const unauthorized = await route.GET(new Request("http://frontend.test/api/trips", {
      headers: { cookie: "tde_session=session-token" },
    }));
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { detail: "Authentication is required." });
    assert.equal(forwarded[0].init.headers.get("cookie"), "tde_session=session-token");

    const unavailable = await route.GET(new Request("http://frontend.test/api/trips"));
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      detail: "Trip service is temporarily unavailable. Please try again.",
    });
  } finally {
    restore();
  }
});

test("trip browser helpers use backend paths, JSON bodies, and CSRF forwarding", async () => {
  const moduleApi = await loadTypeScriptModule(resolve(frontendRoot, "lib/api.ts"));
  const calls = [];
  const originalDocument = globalThis.document;
  globalThis.document = { cookie: "tde_csrf=csrf-token" };
  const restore = installFetchMock(async (url, init) => {
    calls.push({ url, init });
    return Response.json({ id: "trip-1", bookings: [] });
  });

  try {
    await moduleApi.fetchTrips();
    await moduleApi.fetchTrip("trip/one");
    await moduleApi.createTrip({
      title: "City break",
      destination: "Hyderabad",
      start_date: "2026-11-10",
      end_date: "2026-11-12",
    });
    await moduleApi.updateTrip("trip/one", { title: "Updated" });
    await moduleApi.addBookingToTrip("trip/one", "booking two");
    await moduleApi.removeBookingFromTrip("trip/one", "booking two");

    assert.deepEqual(calls.map(({ url, init }) => [url, init.method ?? "GET"]), [
      ["/api/trips", "GET"],
      ["/api/trips/trip%2Fone", "GET"],
      ["/api/trips", "POST"],
      ["/api/trips/trip%2Fone", "PATCH"],
      ["/api/trips/trip%2Fone/bookings/booking%20two", "PUT"],
      ["/api/trips/trip%2Fone/bookings/booking%20two", "DELETE"],
    ]);
    assert.equal(calls[2].init.body, JSON.stringify({
      title: "City break",
      destination: "Hyderabad",
      start_date: "2026-11-10",
      end_date: "2026-11-12",
    }));
    for (const { init } of calls.slice(2)) {
      assert.equal(init.headers["X-CSRF-Token"], "csrf-token");
      assert.equal(init.credentials, "same-origin");
    }
  } finally {
    restore();
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});

test("trip browser helpers retain useful backend errors and HTTP status", async () => {
  const moduleApi = await loadTypeScriptModule(resolve(frontendRoot, "lib/api.ts"));
  const originalDocument = globalThis.document;
  globalThis.document = { cookie: "tde_csrf=csrf-token" };
  const restore = installFetchMock(async () => Response.json(
    { detail: "Trip was not found." },
    { status: 404 },
  ));

  try {
    await assert.rejects(moduleApi.fetchTrip("missing-trip"), (error) => {
      assert.equal(error.message, "Trip was not found.");
      assert.equal(error.status, 404);
      return true;
    });
  } finally {
    restore();
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});
