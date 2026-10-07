import { Link2Off } from "lucide-react";
import { LinkProblem, RecipientFrame } from "./RecipientFrame";

// An unknown or malformed signing link (still a 404). Says nothing about
// whether any agreement exists.
export default function SigningLinkNotFound() {
  return (
    <RecipientFrame>
      <LinkProblem icon={<Link2Off aria-hidden className="size-6" />} title="This link isn’t valid">
        <p>Check that you opened the whole link — it is long, and email apps sometimes cut it off.</p>
        <p>If it still doesn&rsquo;t work, ask the person who sent it for a new one.</p>
      </LinkProblem>
    </RecipientFrame>
  );
}
