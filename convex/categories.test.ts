import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, harness, seedUser, VENDOR_PROFILE } from "../tests/convex-harness";

async function activeVendor() {
  const t = harness();
  const owner = await seedUser(t);
  const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
  await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
  return { t, owner, vendorId };
}

describe("categories authz", () => {
  test("vendor owners can create categories; staff cannot", async () => {
    const { t, owner } = await activeVendor();
    const staff = await seedUser(t, { email: "staff@example.com" });
    await asUser(t, owner).mutation(api.vendors.inviteMember, {
      email: "staff@example.com",
      role: "staff",
    });

    const id = await asUser(t, owner).mutation(api.categories.create, {
      name: "Kids",
      slug: "kids",
    });
    expect(id).toBeTruthy();

    await expect(
      asUser(t, staff).mutation(api.categories.create, { name: "Nope" }),
    ).rejects.toThrow(/manager/i);
  });

  test("admins can create and remove unused categories", async () => {
    const t = harness();
    const admin = await seedUser(t, { role: "admin" });

    const id = await asUser(t, admin).mutation(api.categories.create, {
      name: "Seasonal",
      slug: "seasonal",
    });
    const row = await asUser(t, admin).query(api.categories.get, { categoryId: id });
    expect(row?.name).toBe("Seasonal");
    expect(row?.path).toBe("seasonal");

    await asUser(t, admin).mutation(api.categories.remove, { categoryId: id });
    expect(await asUser(t, admin).query(api.categories.get, { categoryId: id })).toBeNull();
  });

  test("suspended vendors cannot create or ensureSeeded", async () => {
    const { t, owner, vendorId } = await activeVendor();
    await t.run((ctx) => ctx.db.patch(vendorId, { status: "suspended" }));
    await expect(asUser(t, owner).mutation(api.categories.ensureSeeded, {})).rejects.toThrow(
      /suspended/i,
    );
    await expect(
      asUser(t, owner).mutation(api.categories.create, { name: "Blocked" }),
    ).rejects.toThrow(/suspended/i);
  });

  test("anonymous callers cannot read inactive categories", async () => {
    const t = harness();
    const admin = await seedUser(t, { role: "admin" });
    const id = await asUser(t, admin).mutation(api.categories.create, {
      name: "Hidden Root",
      slug: "hidden-root",
      isActive: false,
    });

    expect(await t.query(api.categories.get, { categoryId: id })).toBeNull();
    const publicChildren = await t.query(api.categories.listChildrenOf, {
      activeOnly: false,
    });
    expect(publicChildren.some((row) => row._id === id)).toBe(false);

    const asAdmin = await asUser(t, admin).query(api.categories.get, { categoryId: id });
    expect(asAdmin?.name).toBe("Hidden Root");
  });
});

describe("categories model", () => {
  test("rejects nesting a category under its descendant", async () => {
    const t = harness();
    const admin = await seedUser(t, { role: "admin" });
    const clothes = await asUser(t, admin).mutation(api.categories.create, {
      name: "Clothes",
      slug: "clothes",
    });
    const men = await asUser(t, admin).mutation(api.categories.create, {
      name: "Men",
      slug: "men",
      parentId: clothes,
    });

    await expect(
      asUser(t, admin).mutation(api.categories.update, {
        categoryId: clothes,
        parentId: men,
      }),
    ).rejects.toThrow(/descendant/i);
  });

  test("rejects removing a category that still has children", async () => {
    const t = harness();
    const admin = await seedUser(t, { role: "admin" });
    const parent = await asUser(t, admin).mutation(api.categories.create, {
      name: "Clothes",
      slug: "clothes",
    });
    await asUser(t, admin).mutation(api.categories.create, {
      name: "Men",
      slug: "men",
      parentId: parent,
    });

    await expect(
      asUser(t, admin).mutation(api.categories.remove, { categoryId: parent }),
    ).rejects.toThrow(/child/i);
  });

  test("ensureSeeded is idempotent for active vendors", async () => {
    const { t, owner } = await activeVendor();
    const first = await asUser(t, owner).mutation(api.categories.ensureSeeded, {});
    expect(first.created).toBeGreaterThan(0);
    const second = await asUser(t, owner).mutation(api.categories.ensureSeeded, {});
    expect(second.created).toBe(0);
  });

  test("stores and clears a category image", async () => {
    const { t, owner } = await activeVendor();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["img"], { type: "image/png" })));
    const id = await asUser(t, owner).mutation(api.categories.create, {
      name: "Looks",
      slug: "looks",
      imageStorageId: storageId,
    });
    const listed = await asUser(t, owner).query(api.categories.list, { activeOnly: false });
    const row = listed.find((item) => item._id === id);
    expect(row?.imageStorageId).toBe(storageId);
    expect(row?.imageUrl).toBeTruthy();

    await asUser(t, owner).mutation(api.categories.update, {
      categoryId: id,
      imageStorageId: null,
    });
    const cleared = await asUser(t, owner).query(api.categories.get, { categoryId: id });
    expect(cleared?.imageStorageId).toBeUndefined();
  });
});
