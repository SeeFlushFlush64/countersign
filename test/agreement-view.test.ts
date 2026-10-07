import { describe, expect, it } from "vitest";
import { agreementView, type AgreementFacts, type Viewer } from "@/lib/agreement-view";
import nextConfig from "../next.config";

// Phase E: what the agreement page says and offers — the sequence rail, the
// headline, and exactly one next action — for every state and every kind of
// viewer.

const NOW = new Date("2026-03-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

// Viewers: the sender (a paralegal), the designated countersigner, another
// signatory, and an unrelated company user.
const sender: Viewer = { id: "u-sender", senderId: "s-sender", isSignatory: false };
const countersigner: Viewer = { id: "u-signatory", senderId: "s-signatory", isSignatory: true };
const otherSignatory: Viewer = { id: "u-other", senderId: "s-other", isSignatory: true };
const outsider: Viewer = { id: "u-outsider", senderId: "s-outsider", isSignatory: false };
const VIEWERS = { sender, countersigner, otherSignatory, outsider };

function facts(overrides: Partial<AgreementFacts> = {}): AgreementFacts {
  return {
    id: "a1",
    status: "DRAFT",
    createdAt: ago(10),
    sentAt: null,
    counterpartySignedAt: null,
    countersignedAt: null,
    voidedAt: null,
    voidReason: null,
    voidedByName: null,
    senderId: "s-sender",
    senderName: "Pat Paralegal",
    countersignerId: "u-signatory",
    countersignerName: "Dana Whitfield",
    countersignerIsSignatory: true,
    counterpartyName: "Jordan Vance",
    activeLink: null,
    executedPdf: "none",
    shareablePath: null,
    ...overrides,
  };
}

const sent = (o: Partial<AgreementFacts> = {}) =>
  facts({
    status: "SENT",
    sentAt: ago(5),
    activeLink: { expiresAt: ahead(9), firstViewedAt: null },
    shareablePath: "/s/token",
    ...o,
  });
const signed = (o: Partial<AgreementFacts> = {}) =>
  sent({ status: "PARTIALLY_SIGNED", counterpartySignedAt: ago(2), ...o });
const executed = (o: Partial<AgreementFacts> = {}) =>
  signed({ status: "FULLY_EXECUTED", countersignedAt: ago(1), executedPdf: "ready", ...o });
const voided = (o: Partial<AgreementFacts> = {}) =>
  facts({ status: "VOIDED", voidedAt: ago(1), voidReason: "Wrong entity", voidedByName: "Dana Whitfield", ...o });

const view = (f: AgreementFacts, v: Viewer) => agreementView(f, v, NOW);
const actionKind = (f: AgreementFacts, v: Viewer) => view(f, v).action.kind;

describe("exactly one next action, for the right person", () => {
  it("a draft: the sender or countersigner sends it; nobody else can", () => {
    expect(actionKind(facts(), sender)).toBe("send");
    expect(actionKind(facts(), countersigner)).toBe("send");
    expect(actionKind(facts(), otherSignatory)).toBe("none");
    expect(actionKind(facts(), outsider)).toBe("none");
  });

  it("waiting on the counterparty: share the working link, or issue a new one", () => {
    expect(view(sent(), sender).action).toEqual({ kind: "share-link", path: "/s/token" });
    expect(actionKind(sent(), outsider)).toBe("none");

    const expired = sent({ activeLink: { expiresAt: ago(1), firstViewedAt: null }, shareablePath: null });
    expect(view(expired, sender).action).toEqual({ kind: "reissue", reason: "expired" });
    expect(view(expired, sender).tone).toBe("attention");

    const noLink = sent({ activeLink: null, shareablePath: null });
    expect(view(noLink, countersigner).action).toEqual({ kind: "reissue", reason: "missing" });

    // A working link the viewer cannot read (e.g. sealed under another key).
    expect(view(sent({ shareablePath: null }), sender).action).toEqual({ kind: "reissue", reason: "missing" });
  });

  it("after the counterparty signs: only the designated, authorized countersigner may countersign", () => {
    expect(view(signed(), countersigner).action).toEqual({ kind: "countersign", href: "/agreements/a1/countersign" });
    for (const v of [sender, otherSignatory, outsider]) expect(actionKind(signed(), v)).toBe("none");

    // Designated, but the account lost its signatory role.
    const revoked = { ...countersigner, isSignatory: false };
    expect(actionKind(signed(), revoked)).toBe("none");
    expect(view(signed(), revoked).explanation).toMatch(/no longer authorized/);
    expect(actionKind(signed({ countersignerIsSignatory: false }), countersigner)).toBe("none");
  });

  it("executed: anyone can download it; pending while the PDF is not ready", () => {
    for (const v of Object.values(VIEWERS)) {
      expect(view(executed(), v).action).toEqual({ kind: "download", href: "/api/documents/a1/pdf" });
    }
    expect(actionKind(executed({ executedPdf: "failed" }), outsider)).toBe("pdf-pending");
    expect(actionKind(executed({ executedPdf: "pending" }), outsider)).toBe("pdf-pending");
  });

  it("voided: nothing to do", () => {
    for (const v of Object.values(VIEWERS)) expect(actionKind(voided(), v)).toBe("none");
  });

  it("offers reissue and void only to people who manage the agreement, only while it can change", () => {
    expect(view(sent(), sender)).toMatchObject({ canReissue: true, canVoid: true });
    expect(view(sent(), outsider)).toMatchObject({ canReissue: false, canVoid: false });
    expect(view(signed(), countersigner)).toMatchObject({ canReissue: false, canVoid: true });
    expect(view(executed(), sender)).toMatchObject({ canVoid: false });
    expect(view(voided(), sender)).toMatchObject({ canVoid: false });
  });
});

describe("the sequence rail", () => {
  const states = (f: AgreementFacts, v: Viewer = sender) => view(f, v).steps.map((s) => s.state);

  it("moves through send → counterparty → countersign in order", () => {
    expect(states(facts())).toEqual(["current", "ahead", "ahead"]);
    expect(states(sent())).toEqual(["done", "current", "ahead"]);
    expect(states(signed())).toEqual(["done", "done", "current"]);
    expect(states(executed())).toEqual(["done", "done", "done"]);
    expect(view(executed(), sender).outcome).toEqual({ kind: "executed", at: ago(1) });
    expect(view(sent(), sender).outcome).toEqual({ kind: "open" });
  });

  it("shows where a void stopped the sequence", () => {
    expect(states(voided())).toEqual(["stopped", "ahead", "ahead"]);
    expect(states(voided({ sentAt: ago(3) }))).toEqual(["done", "stopped", "ahead"]);
    expect(states(voided({ sentAt: ago(3), counterpartySignedAt: ago(2) }))).toEqual(["done", "done", "stopped"]);
    expect(view(voided({ sentAt: ago(3) }), sender).outcome).toMatchObject({
      kind: "voided",
      by: "Dana Whitfield",
      reason: "Wrong entity",
      afterStep: 1,
    });
  });

  it("names each step's person, marking the viewer", () => {
    const steps = view(signed(), countersigner).steps;
    expect(steps.map((s) => s.actor)).toEqual(["Pat Paralegal", "Jordan Vance", "Dana Whitfield (you)"]);
    expect(view(signed(), sender).steps[0].actor).toBe("Pat Paralegal (you)");
    expect(steps[2]).toMatchObject({ title: "Countersigns second", detail: "Designated company signatory" });
  });

  it("says how the counterparty's link stands while waiting on them", () => {
    expect(view(sent(), sender).steps[1].detail).toMatch(/^Link not opened yet · expires /);
    expect(view(sent({ activeLink: { expiresAt: ahead(9), firstViewedAt: ago(1) } }), sender).steps[1].detail).toMatch(
      /^Opened their link /,
    );
    expect(view(sent({ activeLink: { expiresAt: ago(1), firstViewedAt: null } }), sender).steps[1].detail).toMatch(
      /^Signing link expired /,
    );
  });
});

describe("plain-language headlines", () => {
  it("quote a void reason without doubling its punctuation", () => {
    expect(view(voided({ voidReason: "Wrong entity" }), sender).explanation).toBe(
      "Dana Whitfield voided it: “Wrong entity”. It can no longer be signed.",
    );
    expect(view(voided({ voidReason: "Wrong entity." }), sender).explanation).toBe(
      "Dana Whitfield voided it: “Wrong entity.” It can no longer be signed.",
    );
  });

  it("say who the agreement waits on, without internal status names", () => {
    expect(view(facts(), sender).headline).toBe("Draft — not sent yet");
    expect(view(sent(), sender).headline).toBe("Waiting on Jordan Vance to sign");
    expect(view(signed(), countersigner).headline).toBe("Ready for your countersignature");
    expect(view(signed(), sender).headline).toBe("Waiting on Dana Whitfield to countersign");
    expect(view(executed(), sender).headline).toMatch(/^Executed on /);
    expect(view(voided(), sender).headline).toMatch(/^Voided on /);
    for (const f of [facts(), sent(), signed(), executed(), voided()]) {
      for (const v of Object.values(VIEWERS)) {
        const { headline, explanation } = view(f, v);
        expect(`${headline} ${explanation}`).not.toMatch(/PARTIALLY|FULLY_EXECUTED|SENT\b|DRAFT\b|VOIDED/);
      }
    }
  });
});

describe("old agreement links", () => {
  it("redirect permanently to the new agreement pages", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/documents/:id", destination: "/agreements/:id", permanent: true },
        { source: "/documents/:id/countersign", destination: "/agreements/:id/countersign", permanent: true },
        { source: "/create", destination: "/agreements/new", permanent: true },
        { source: "/activity", destination: "/audit", permanent: true },
      ]),
    );
  });
});
