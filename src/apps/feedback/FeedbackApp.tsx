import { sleekplanEmbedUrl } from "../../os/sleekplan";

export default function FeedbackApp() {
  return (
    <iframe
      src={sleekplanEmbedUrl}
      title="Feedback"
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
      }}
    />
  );
}
