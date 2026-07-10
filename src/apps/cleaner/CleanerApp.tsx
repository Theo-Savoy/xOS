type CleanerAppProps = {
  params?: Record<string, string>;
};

export default function CleanerApp({ params }: CleanerAppProps) {
  const query = params?.q ? `?q=${encodeURIComponent(params.q)}` : "";
  return (
    <iframe
      src={`/dashboard.html${query}`}
      title="CRM Cleaner"
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
      }}
    />
  );
}
