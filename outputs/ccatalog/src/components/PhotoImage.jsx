import { useEffect, useRef, useState } from "react";

export default function PhotoImage({ photo, ...props }) {
  const [source, setSource] = useState(photo.url);
  const displayed = useRef(source);
  useEffect(() => {
    if (photo.url === displayed.current) return;
    let active = true;
    const replacement = new Image();
    // Keep the decoded photo visible while its short-lived URL is renewed.
    replacement.onload = async () => {
      try {
        await replacement.decode();
      } catch {
        /* Loaded images can still render. */
      }
      if (!active) return;
      displayed.current = photo.url;
      setSource(photo.url);
    };
    replacement.src = photo.url;
    return () => {
      active = false;
      replacement.onload = null;
    };
  }, [photo.url]);
  return <img {...props} src={source} />;
}
