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
      name: "Seasonal",
      slug: "seasonal",
    });
    expect(id).toBeTruthy();

    await expect(
      asUser(t, staff).mutation(api.categories.create, { name: "Nope" }),
    ).rejects.toThrow(/manager/i);
  });

  test("categories are scoped per store", async () => {
    const { t, owner, vendorId } = await activeVendor();
    const rival = await seedUser(t, { email: "rival@example.com" });
    const rivalVendorId = await asUser(t, rival).mutation(api.vendors.register, {
      ...VENDOR_PROFILE,
      name: "Rival Co",
    });
    await t.run((ctx) => ctx.db.patch(rivalVendorId, { status: "active" }));

    const ownerTree = await asUser(t, owner).query(api.categories.tree, {});
    const rivalTree = await asUser(t, rival).query(api.categories.tree, {});
    expect(ownerTree.some((node) => node.slug === "men")).toBe(true);
    expect(rivalTree.some((node) => node.slug === "men")).toBe(true);
    expect(ownerTree[0]?._id).not.toBe(rivalTree[0]?._id);

    const seasonal = await asUser(t, owner).mutation(api.categories.create, {
      name: "Seasonal",
      slug: "seasonal",
    });
    const rivalList = await asUser(t, rival).query(api.categories.list, { activeOnly: false });
    expect(rivalList.some((row) => row._id === seasonal)).toBe(false);

    const publicRoots = await t.query(api.categories.listChildrenOf, {
      vendorId,
      activeOnly: true,
    });
    expect(publicRoots.some((row) => row.slug === "men")).toBe(true);
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
    const { t, owner, vendorId } = await activeVendor();
    const id = await asUser(t, owner).mutation(api.categories.create, {
      name: "Hidden Root",
      slug: "hidden-root",
      isActive: false,
    });

    expect(await t.query(api.categories.get, { categoryId: id })).toBeNull();
    const publicChildren = await t.query(api.categories.listChildrenOf, {
      vendorId,
      activeOnly: false,
    });
    expect(publicChildren.some((row) => row._id === id)).toBe(false);

    const asOwner = await asUser(t, owner).query(api.categories.get, { categoryId: id });
    expect(asOwner?.name).toBe("Hidden Root");
  });
});

describe("categories model", () => {
  test("rejects nesting a category under its descendant", async () => {
    const { t, owner } = await activeVendor();
    const men = await asUser(t, owner).mutation(api.categories.create, {
      name: "Custom Men",
      slug: "custom-men",
    });
    const tops = await asUser(t, owner).mutation(api.categories.create, {
      name: "Custom Tops",
      slug: "custom-tops",
      parentId: men,
    });

    await expect(
      asUser(t, owner).mutation(api.categories.update, {
        categoryId: men,
        parentId: tops,
      }),
    ).rejects.toThrow(/descendant/i);
  });

  test("rejects removing a category that still has children", async () => {
    const { t, owner } = await activeVendor();
    const parent = await asUser(t, owner).mutation(api.categories.create, {
      name: "Capsule",
      slug: "capsule",
    });
    await asUser(t, owner).mutation(api.categories.create, {
      name: "Drop A",
      slug: "drop-a",
      parentId: parent,
    });

    await expect(
      asUser(t, owner).mutation(api.categories.remove, { categoryId: parent }),
    ).rejects.toThrow(/child/i);
  });

  test("register seeds Men/Women/Kids; ensureSeeded is idempotent", async () => {
    const { t, owner } = await activeVendor();
    const tree = await asUser(t, owner).query(api.categories.tree, {});
    expect(tree.map((node) => node.slug).sort()).toEqual(["kids", "men", "women"]);
    const men = tree.find((node) => node.slug === "men");
    expect(men?.children.some((child) => child.slug === "topwear")).toBe(true);

    const again = await asUser(t, owner).mutation(api.categories.ensureSeeded, {});
    expect(again.created).toBe(0);
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
