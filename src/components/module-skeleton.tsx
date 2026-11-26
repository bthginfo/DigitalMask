"use client";

/** Light placeholder while a module chunk loads; mirrors the page heading and a short list. */
export function ModuleSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="module-skeleton" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Ansicht wird geladen …</span>
      <div className="module-skeleton-heading" aria-hidden="true">
        <span className="module-skeleton-line short" />
        <span className="module-skeleton-line title" />
      </div>
      <div className="module-skeleton-panel" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <span className="module-skeleton-row" key={index} />
        ))}
      </div>
    </div>
  );
}
