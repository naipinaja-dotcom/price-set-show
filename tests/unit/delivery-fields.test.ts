import { describe, expect, it } from "vitest";
import { buildDeliveryConfig, emptyDeliveryState } from "@/components/pricing-form/delivery-fields";

describe("buildDeliveryConfig", () => {
  it("saves the Distance dimension when the checkbox is on, even if the stale internal enabled flag never flipped (GORECA regression)", () => {
    const state = emptyDeliveryState();
    // Meniru persis apa yang kejadian di form: user centang Distance (subtype),
    // isi baris tarif di tabel (rows) — tapi state.distance.enabled tetap
    // default false karena gak ada UI yang nyentuh field itu.
    state.distance.rows = [{ type: "flat", from: "0", to: "12", base_fee: "15000", step: "0", add_per_step: "0" }];

    const config = buildDeliveryConfig({ distance: true, weight: false }, state);

    expect(config.distance).not.toBeNull();
    // Ini persis yang lolos sebelumnya: gerbang luar (null vs objek) udah bener,
    // tapi enabled DI DALAM objeknya sendiri (yang beneran dibaca pricing-calc.ts)
    // masih ikutan state.distance.enabled yang basi kalau gak dites eksplisit.
    expect(config.distance?.enabled).toBe(true);
    expect(config.distance?.rows[0].base_fee).toBe(15000);
    expect(config._dims).toEqual({ distance: true, weight: false });
  });

  it("still saves null when the checkbox is off", () => {
    const state = emptyDeliveryState();
    state.distance.rows = [{ type: "flat", from: "0", to: "12", base_fee: "15000", step: "0", add_per_step: "0" }];

    const config = buildDeliveryConfig({ distance: false, weight: false }, state);

    expect(config.distance).toBeNull();
    expect(config._dims).toEqual({ distance: false, weight: false });
  });
});
