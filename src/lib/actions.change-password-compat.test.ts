import { describe, expect, it, vi } from "vitest";

const changePasswordIdentityAction = vi.hoisted(() => vi.fn());

vi.mock("@/modules/identity", () => ({
  changePasswordAction: changePasswordIdentityAction,
}));

import { changePasswordAction } from "./actions";

describe("lib actions changePasswordAction compatibility export", () => {
  it("delegates to the identity module action", async () => {
    const formData = new FormData();
    formData.set("currentPassword", "oldpass123");
    formData.set("newPassword", "newpass123");
    formData.set("confirmPassword", "newpass123");

    changePasswordIdentityAction.mockResolvedValue(undefined);

    await expect(changePasswordAction(formData)).resolves.toBeUndefined();
    expect(changePasswordIdentityAction).toHaveBeenCalledWith(formData);
  });
});
