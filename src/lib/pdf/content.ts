import type { TemplateType } from "@/generated/prisma/enums";

export const COMPANY_NAME = "Northlight Media Group";
export const COMPANY_ADDRESS =
  "44 Cannery Row, Suite 300, Portland, OR 97209";

type Clause = { heading: string; body: string };

type TemplateContent = {
  label: string;
  recital: string;
  clauses: Clause[];
};

// Fictional, genuinely-authored boilerplate — not copied from any real
// client template. Merge fields use Handlebars syntax and are resolved
// at render time in src/lib/pdf/render.ts.
export const TEMPLATE_CONTENT: Record<TemplateType, TemplateContent> = {
  NDA: {
    label: "Mutual Non-Disclosure Agreement",
    recital:
      "This Mutual Non-Disclosure Agreement (the &ldquo;Agreement&rdquo;) is entered into as of {{effectiveDate}} by and between {{companyName}}, with offices at {{companyAddress}} (&ldquo;Company&rdquo;), and {{counterpartyName}} (&ldquo;Counterparty&rdquo;), each a &ldquo;Party&rdquo; and together the &ldquo;Parties,&rdquo; in connection with a possible business relationship between the Parties (the &ldquo;Purpose&rdquo;).",
    clauses: [
      {
        heading: "1. Confidential Information",
        body: "&ldquo;Confidential Information&rdquo; means any non-public information disclosed by either Party, whether orally, in writing, or by inspection of tangible or intangible materials, that is designated as confidential or that a reasonable person would understand to be confidential given the nature of the information and the circumstances of disclosure.",
      },
      {
        heading: "2. Obligations",
        body: "Each Party agrees to use the other Party&rsquo;s Confidential Information solely in connection with the Purpose, to protect it using at least the same degree of care it uses to protect its own confidential information, and not to disclose it to any third party without the prior written consent of the disclosing Party.",
      },
      {
        heading: "3. Exclusions",
        body: "Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the receiving Party; (b) was rightfully known to the receiving Party prior to disclosure; (c) is rightfully received from a third party without breach of any confidentiality obligation; or (d) is independently developed without use of the disclosing Party&rsquo;s Confidential Information.",
      },
      {
        heading: "4. Term",
        body: "The obligations of confidentiality under this Agreement shall remain in effect for a period of three (3) years from the Effective Date, regardless of any earlier termination of discussions between the Parties.",
      },
      {
        heading: "5. No License",
        body: "Nothing in this Agreement shall be construed as granting any rights, by license or otherwise, to any Confidential Information disclosed hereunder, except as expressly set forth herein.",
      },
      {
        heading: "6. Governing Law",
        body: "This Agreement shall be governed by and construed in accordance with the laws of the State of Oregon, without regard to its conflict of laws principles.",
      },
    ],
  },
  VENDOR_AGREEMENT: {
    label: "Vendor Services Agreement",
    recital:
      "This Vendor Services Agreement (the &ldquo;Agreement&rdquo;) is entered into as of {{effectiveDate}} by and between {{companyName}}, with offices at {{companyAddress}} (&ldquo;Company&rdquo;), and {{counterpartyName}} (&ldquo;Vendor&rdquo;), pursuant to which Vendor will provide certain services to Company as further described herein.",
    clauses: [
      {
        heading: "1. Services",
        body: "Vendor shall perform the services described in any statement of work agreed by the Parties in writing (each, a &ldquo;Statement of Work&rdquo;), which shall be incorporated into this Agreement by reference upon execution by both Parties.",
      },
      {
        heading: "2. Fees & Payment",
        body: "Company shall pay Vendor the fees set forth in the applicable Statement of Work. Unless otherwise specified, invoices are due within thirty (30) days of receipt.",
      },
      {
        heading: "3. Independent Contractor",
        body: "Vendor is an independent contractor and not an employee, agent, or partner of Company. Nothing in this Agreement shall be construed to create a joint venture, partnership, or employment relationship between the Parties.",
      },
      {
        heading: "4. Ownership of Deliverables",
        body: "Except as otherwise agreed in writing, all deliverables created by Vendor specifically for Company under a Statement of Work shall be considered &ldquo;work made for hire&rdquo; and shall be owned exclusively by Company upon full payment.",
      },
      {
        heading: "5. Confidentiality",
        body: "Each Party agrees to hold the other Party&rsquo;s confidential information in strict confidence and to use it solely for purposes of performing its obligations under this Agreement.",
      },
      {
        heading: "6. Termination",
        body: "Either Party may terminate this Agreement for convenience upon thirty (30) days&rsquo; written notice to the other Party. Company shall pay Vendor for all services properly rendered prior to the effective date of termination.",
      },
      {
        heading: "7. Governing Law",
        body: "This Agreement shall be governed by and construed in accordance with the laws of the State of Oregon, without regard to its conflict of laws principles.",
      },
    ],
  },
  MEDIA_RELEASE: {
    label: "Media Release & Consent",
    recital:
      "This Media Release &amp; Consent (the &ldquo;Release&rdquo;) is given as of {{effectiveDate}} by {{counterpartyName}} (&ldquo;Participant&rdquo;) in favor of {{companyName}}, with offices at {{companyAddress}} (&ldquo;Company&rdquo;), in connection with Participant&rsquo;s appearance in photographs, video, audio, or other media captured by or on behalf of Company (the &ldquo;Media&rdquo;).",
    clauses: [
      {
        heading: "1. Grant of Rights",
        body: "Participant grants Company an irrevocable, worldwide, royalty-free right to use, reproduce, edit, and distribute the Media, in whole or in part, in any medium now known or later developed, for editorial, promotional, and marketing purposes.",
      },
      {
        heading: "2. No Compensation",
        body: "Participant acknowledges that participation is voluntary and that no royalty, fee, or other compensation is owed to Participant for the use of the Media unless separately agreed in writing.",
      },
      {
        heading: "3. No Obligation to Use",
        body: "Company is under no obligation to use the Media and may, at its sole discretion, choose not to publish or distribute any or all of the Media captured.",
      },
      {
        heading: "4. Release of Claims",
        body: "Participant releases Company, its employees, and agents from any and all claims arising from the use of the Media, including any claims for defamation, invasion of privacy, or right of publicity, to the extent permitted by applicable law.",
      },
      {
        heading: "5. Revocation",
        body: "This Release may be revoked by Participant only with respect to Media not yet published, by providing written notice to Company. Revocation shall not affect Media already published or in distribution prior to receipt of notice.",
      },
      {
        heading: "6. Governing Law",
        body: "This Release shall be governed by and construed in accordance with the laws of the State of Oregon, without regard to its conflict of laws principles.",
      },
    ],
  },
  LICENSING_ORDER: {
    label: "Content Licensing Order Form",
    recital:
      "This Content Licensing Order Form (the &ldquo;Order&rdquo;) is entered into as of {{effectiveDate}} by and between {{companyName}}, with offices at {{companyAddress}} (&ldquo;Licensor&rdquo;), and {{counterpartyName}} (&ldquo;Licensee&rdquo;), pursuant to and incorporating the terms of any master licensing agreement in effect between the Parties, or, absent such agreement, the terms set forth below.",
    clauses: [
      {
        heading: "1. Licensed Content",
        body: "Licensor grants Licensee a non-exclusive, non-transferable license to use the content identified in Exhibit A of this Order (the &ldquo;Licensed Content&rdquo;) solely for the purposes and territory specified therein.",
      },
      {
        heading: "2. License Fee",
        body: "In consideration for the rights granted herein, Licensee shall pay Licensor the license fee set forth in Exhibit A, due within thirty (30) days of the Effective Date unless otherwise specified.",
      },
      {
        heading: "3. Term & Territory",
        body: "Unless otherwise specified in Exhibit A, this license shall remain in effect for a period of twelve (12) months from the Effective Date and shall apply worldwide.",
      },
      {
        heading: "4. Restrictions",
        body: "Licensee shall not sublicense, resell, or otherwise transfer the Licensed Content to any third party without the prior written consent of Licensor, and shall use the Licensed Content only in the manner and context approved by Licensor.",
      },
      {
        heading: "5. Attribution",
        body: "Licensee shall include attribution to Licensor in connection with any public use of the Licensed Content, in a form and placement reasonably acceptable to Licensor.",
      },
      {
        heading: "6. Governing Law",
        body: "This Order shall be governed by and construed in accordance with the laws of the State of Oregon, without regard to its conflict of laws principles.",
      },
    ],
  },
};
