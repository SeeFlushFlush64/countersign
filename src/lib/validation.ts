import { z } from "zod";

// Input rules for everything a user types. Shared by the Server Actions (for
// friendly form errors) and the domain functions (so no caller — the seed, a
// test, a future API — can bypass them).

export const LIMITS = {
  title: 200,
  counterpartyName: 120,
  email: 254,
  voidReasonMin: 3,
  voidReason: 500,
} as const;

// Collapses runs of whitespace (including newlines and tabs) to one space,
// removes other control characters, and trims.
export function normalizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const text = (label: string, max: number, min = 1) =>
  z
    .string({ error: `${label} is required.` })
    .transform(normalizeText)
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
        .max(max, `${label} must be at most ${max} characters.`),
    );

export const agreementInputSchema = z.object({
  title: text("Title", LIMITS.title),
  counterpartyName: text("Counterparty name", LIMITS.counterpartyName),
  counterpartyEmail: z
    .string({ error: "Counterparty email is required." })
    .transform((value) => normalizeText(value).toLowerCase())
    .pipe(
      z
        .string()
        .max(LIMITS.email, `Counterparty email must be at most ${LIMITS.email} characters.`)
        .email("Enter a valid email address."),
    ),
});

export const voidReasonSchema = text("A reason", LIMITS.voidReason, LIMITS.voidReasonMin);

export type AgreementInput = z.infer<typeof agreementInputSchema>;

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
