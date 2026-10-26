import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useApi } from "./api";
import ErrorBoundary from "./ErrorBoundary";

vi.mock("./Charts", () => ({
  default: () => <div>Chart loaded</div>,
  AccuracyCharts: () => <div>Accuracy charts loaded</div>,
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/?view=desk");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dashboard states", () => {
  it("shows loading and keeps decision filters shareable", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading verified Elexon data",
    );
    fireEvent.change(screen.getByLabelText("Decision date"), {
      target: { value: "2026-01-31" },
    });
    expect(window.location.search).toContain("date=2026-01-31");
    expect(
      screen.getByRole("button", { name: "Next decision day" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Information cutoff"), {
      target: { value: "15:00" },
    });
    expect(window.location.search).toContain("cutoff=15%3A00");
  });

  it("explains API failures and supports retry", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Snapshot unavailable" }),
    } as Response);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Snapshot unavailable",
    );
    const before = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("sanitizes an invalid shared URL to supported defaults", () => {
    window.history.replaceState(
      null,
      "",
      "/?date=2026-01-99&cutoff=25:00&view=other",
    );
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByLabelText("Decision date")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("Information cutoff")).toHaveValue("09:00");
  });
});

it("aborts obsolete requests and never replaces a newer response with an older one", async () => {
  let resolveOld: (value: Response) => void = () => {};
  vi.mocked(fetch).mockImplementation((path) =>
    String(path) === "/old"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({
          ok: true,
          json: async () => ({ value: "new" }),
        } as Response),
  );
  function Probe({ path }: { path: string }) {
    const query = useApi<{ value: string }>(path);
    return <div>{query.data?.value ?? "loading"}</div>;
  }
  const view = render(<Probe path="/old" />);
  const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.rerender(<Probe path="/new" />);
  expect(await screen.findByText("new")).toBeInTheDocument();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {
    resolveOld({ ok: true, json: async () => ({ value: "old" }) } as Response);
  });
  expect(screen.getByText("new")).toBeInTheDocument();
});

it("reuses public snapshots, isolates selections and refreshes on explicit retry", async () => {
  vi.mocked(fetch).mockImplementation((path) =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        value: String(path).includes("second") ? "second" : "first",
      }),
    } as Response),
  );
  function Probe({ path }: { path: string }) {
    const query = useApi<{ value: string }>(path);
    return (
      <>
        <span>{query.data?.value ?? "loading"}</span>
        <button onClick={query.retry}>Refresh</button>
      </>
    );
  }
  const first = "/api/v1/cache-test?selection=first";
  const second = "/api/v1/cache-test?selection=second";
  const view = render(<Probe path={first} />);
  await screen.findByText("first");
  view.rerender(<Probe path={second} />);
  expect(screen.queryByText("first")).not.toBeInTheDocument();
  await screen.findByText("second");
  view.rerender(<Probe path={first} />);
  expect(screen.getByText("first")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  await screen.findByText("first");
});

it("does not cache account responses", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ value: "account" }),
  } as Response);
  function Probe() {
    const query = useApi<{ value: string }>("/api/auth/cache-test");
    return <span>{query.data?.value ?? "loading"}</span>;
  }
  const view = render(<Probe />);
  await screen.findByText("account");
  view.unmount();
  render(<Probe />);
  await screen.findByText("account");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not request a disabled preview until it is selected", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ value: "selected" }),
  } as Response);
  function Probe({ enabled }: { enabled: boolean }) {
    const query = useApi<{ value: string }>("/api/v1/deferred-test", enabled);
    return <span>{query.data?.value ?? "idle"}</span>;
  }
  const view = render(<Probe enabled={false} />);
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(<Probe enabled />);
  await screen.findByText("selected");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("times out a stuck request, ignores its late response and retries", async () => {
  vi.useFakeTimers();
  let resolveLate: (value: Response) => void = () => {};
  vi.mocked(fetch)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLate = resolve;
      }),
    )
    .mockResolvedValue({
      ok: true,
      json: async () => ({ value: "recovered" }),
    } as Response);
  function Probe() {
    const query = useApi<{ value: string }>("/api/v1/timeout-test");
    return (
      <>
        <span>{query.error ?? query.data?.value ?? "loading"}</span>
        <button onClick={query.retry}>Retry timeout</button>
      </>
    );
  }
  render(<Probe />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByText(/request timed out/)).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => {
    resolveLate({
      ok: true,
      json: async () => ({ value: "obsolete" }),
    } as Response);
  });
  expect(screen.queryByText("obsolete")).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Retry timeout" }));
  });
  expect(screen.getByText("recovered")).toBeInTheDocument();
});

it("contains render failures and provides a recovery action", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("Example private exception");
  }
  render(
    <ErrorBoundary label="Chart unavailable">
      <Broken />
    </ErrorBoundary>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Chart unavailable");
  expect(
    screen.getByRole("button", { name: "Reload application" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Example private exception"),
  ).not.toBeInTheDocument();
});
