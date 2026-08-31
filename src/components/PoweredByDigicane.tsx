import { APP_VERSION } from "@/lib/app-version";

export function PoweredByDigicane({ className = "" }: { className?: string }) {
  return (
    <div className={`text-xs text-[var(--muted)] ${className}`.trim()}>
      <p>
        <a
          href="https://www.digicanesystems.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline hover:text-teal-700"
        >
          Powered By Digicane Systems
        </a>
      </p>
      <p className="mt-1 opacity-80">v{APP_VERSION}</p>
    </div>
  );
}
