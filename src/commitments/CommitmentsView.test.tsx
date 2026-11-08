import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommitmentsView } from "./CommitmentsView";
import { readRegister, STORAGE_KEY } from "./register";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
function capture() {
  fireEvent.change(screen.getByLabelText("Meeting / source"), { target: { value: "Synthetic minutes" } });
  fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "Action: Review test proposal | Owner: Ali | Due: 2026-11-01" } });
  fireEvent.submit(screen.getByRole("button", { name: "Extract for review" }).closest("form")!);
}
it("requires review, persists records, closes them and reloads the same register", () => {
  const { unmount } = render(<CommitmentsView lang="en" />);
  capture();
  const save = screen.getByRole("button", { name: "Save reviewed records" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect(readRegister().register.records).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(save);
  expect(readRegister().register.records).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Status: Review test proposal"), { target: { value: "closed" } });
  expect(readRegister().register.records[0].closedOn).not.toBeNull();
  unmount(); render(<CommitmentsView lang="en" />);
  expect((screen.getByLabelText("Status: Review test proposal") as HTMLSelectElement).value).toBe("closed");
  expect(screen.getByText(/Closed in the last seven days \(1\)/)).toBeTruthy();
});
it("invalidates the review when source text changes", () => {
  render(<CommitmentsView lang="en" />); capture(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "Decision: Changed" } });
  expect(screen.queryByRole("button", { name: "Save reviewed records" })).toBeNull();
  expect(readRegister().register.records).toHaveLength(0);
});
it("preserves corrupt storage and blocks captures", () => {
  localStorage.setItem(STORAGE_KEY, "invalid"); render(<CommitmentsView lang="en" />);
  expect((screen.getByRole("button", { name: "Extract for review" }) as HTMLButtonElement).disabled).toBe(true);
  expect(localStorage.getItem(STORAGE_KEY)).toBe("invalid");
  expect(screen.getByRole("alert").textContent).toContain("preserved");
});
it("surfaces storage failure without displaying a successful save", () => {
  render(<CommitmentsView lang="en" />); capture(); fireEvent.click(screen.getByRole("checkbox"));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed records" }));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(screen.queryByRole("status")).toBeNull();
});
it("rejects an invalid backup without replacing the saved register", async () => {
  render(<CommitmentsView lang="en" />); capture(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed records" }));
  const before = localStorage.getItem(STORAGE_KEY);
  fireEvent.change(screen.getByLabelText("Restore backup (replaces this register)"), { target: { files: [{ size: 2, text: async () => "{}" }] } });
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
it("renders Arabic capture and unknown fields without transliterating source text", () => {
  render(<CommitmentsView lang="ar" />);
  fireEvent.change(screen.getByLabelText("الاجتماع / المصدر"), { target: { value: "اجتماع تجريبي" } });
  fireEvent.change(screen.getByLabelText("المحضر"), { target: { value: "إجراء: مراجعة العرض" } });
  fireEvent.submit(screen.getByRole("button", { name: "استخراج للمراجعة" }).closest("form")!);
  expect(screen.getByText("مراجعة العرض")).toBeTruthy();
  expect(screen.getByText(/المسؤول: غير محدد/)).toBeTruthy();
});
it("previews a valid backup and cancels without overwriting saved data", async () => {
  render(<CommitmentsView lang="en" />); capture(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed records" }));
  const before = localStorage.getItem(STORAGE_KEY);
  const file = { size: 32, text: async () => JSON.stringify({ schemaVersion: 1, records: [] }) };
  fireEvent.change(screen.getByLabelText("Restore backup (replaces this register)"), { target: { files: [file] } });
  await screen.findByRole("button", { name: "Confirm restore" });
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Cancel restore" }));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  fireEvent.change(screen.getByLabelText("Restore backup (replaces this register)"), { target: { files: [file] } });
  fireEvent.click(await screen.findByRole("button", { name: "Confirm restore" }));
  expect(readRegister().register.records).toHaveLength(0);
});
it("requires original-text recovery and acknowledgement before replacing corrupt storage", async () => {
  localStorage.setItem(STORAGE_KEY, "corrupt synthetic original");
  render(<CommitmentsView lang="en" />);
  fireEvent.change(screen.getByLabelText("Restore backup (replaces this register)"), { target: { files: [{ size: 32, text: async () => JSON.stringify({ schemaVersion: 1, records: [] }) }] } });
  const confirm = await screen.findByRole("button", { name: "Confirm restore" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  expect(localStorage.getItem(STORAGE_KEY)).toBe("corrupt synthetic original");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:synthetic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Download original stored text" }));
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(confirm);
  expect(readRegister().error).toBe(false);
  expect(readRegister().register.records).toHaveLength(0);
});
it("ignores an earlier backup read when a newer file has been selected", async () => {
  render(<CommitmentsView lang="en" />);
  let finish!: (value: string) => void;
  const slow = new Promise<string>(resolve => { finish = resolve; });
  const input = screen.getByLabelText("Restore backup (replaces this register)");
  fireEvent.change(input, { target: { files: [{ size: 32, text: () => slow }] } });
  fireEvent.change(input, { target: { files: [{ size: 2, text: async () => "{}" }] } });
  await screen.findByRole("alert");
  await act(async () => { finish(JSON.stringify({ schemaVersion: 1, records: [] })); });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm restore" })).toBeNull());
});
