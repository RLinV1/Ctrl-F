export type Status = { text: string; error?: boolean };

export default function StatusLine({ status }: { status: Status }) {
  return <div className={status.error ? "out err" : "out"}>{status.text}</div>;
}
