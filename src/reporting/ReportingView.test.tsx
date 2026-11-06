import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportingView } from "./ReportingView";
import { api, setApiToken } from "./api";

vi.mock("./api", () => ({ setApiToken: vi.fn(), api: {
  health: vi.fn(), datasets: vi.fn(), memory: vi.fn(), runs: vi.fn(),
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("retries after denied authentication and clears the password field", async () => {
  vi.mocked(api.health).mockRejectedValueOnce(new Error("Valid bearer token required"));
  render(<ReportingView lang="en" />);
  const input = await screen.findByLabelText("Service access token");
  await waitFor(() => expect(api.health).toHaveBeenCalledTimes(1));
  vi.mocked(api.health).mockResolvedValue({ version: "test", routing: { default_provider: "mock", roles: {}, allow_rows: false, mock: true, providers_with_keys: [] }, supported_files: [], datasets: 0 });
  vi.mocked(api.datasets).mockResolvedValue({ datasets: [] });
  vi.mocked(api.memory).mockResolvedValue({ items: [] });
  fireEvent.change(input, { target: { value: "test-only-value" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("button", { name: "Disconnect" });
  expect(setApiToken).toHaveBeenCalledWith("test-only-value");
  expect(screen.queryByLabelText("Service access token")).toBeNull();
});
