import { useEffect, useRef, useState } from "react";

export interface NavItem {
  id: string;
  label: string;
}

const SECTIONS: NavItem[] = [
  { id: "cost", label: "Cost" },
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "tokens", label: "Tokens" },
  { id: "models-tools", label: "Models & Tools" },
  { id: "workspace", label: "Workspace" },
];

export function SectionNav() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const visibleSections = new Map<string, number>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry.intersectionRatio);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        // Pick the section with the highest visibility among the defined order
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibleSections) {
          if (ratio > bestRatio) {
            best = id;
            bestRatio = ratio;
          }
        }
        if (best) setActiveId(best);
      },
      { rootMargin: "-80px 0px -40% 0px", threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );

    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav className="sticky top-2 z-30 flex justify-center">
      <div className="flex gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-1 shadow-sm backdrop-blur-md overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeId === section.id
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
