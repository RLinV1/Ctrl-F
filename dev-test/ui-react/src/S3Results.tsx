import { useEffect, useState } from "react";

// Photos in the AWS bucket: what the Pi uploaded (incoming/) and what the model made of them (results/).
export default function S3Results() {
  const [prefix, setPrefix] = useState<"incoming" | "results">("incoming");
  const [keys, setKeys] = useState<string[] | null>(null);
  const [bucket, setBucket] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setKeys(null);
    setError("");
    fetch(`/api/s3/results?prefix=${prefix}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => { setKeys(b.keys); setBucket(b.bucket); })
      .catch(() => setError("Could not read the bucket. Check the AWS credentials and the API server."));
  }, [prefix]);

  return (
    <section>
      <h2>Photos in S3</h2>
      <p>
        <button onClick={() => setPrefix("incoming")} disabled={prefix === "incoming"}>Incoming (from the Pi)</button>{" "}
        <button onClick={() => setPrefix("results")} disabled={prefix === "results"}>Results (from the model)</button>{" "}
      </p>
      {error ? <p className="err">{error}</p> : !keys ? <p className="out">Loading...</p> : (
        <>
          <p className="out">s3://{bucket}/{prefix}/, newest first</p>
          {keys.length === 0 && <p className="out">Nothing here yet.</p>}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
            {keys.map((k) => (
              <figure key={k}>
                <img src={`/api/s3/image?key=${encodeURIComponent(k)}`} alt={k} style={{ width: "100%", display: "block" }} />
                <figcaption className="out">{k}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
