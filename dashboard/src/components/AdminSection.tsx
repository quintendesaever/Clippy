import type { ReactNode } from "react";

export default function AdminSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="adminSection">
      <header className="adminSectionHead">
        <h2 className="adminSectionTitle">{title}</h2>
        {hint && <p className="adminSectionHint">{hint}</p>}
      </header>
      <div className="adminSectionStack">{children}</div>
    </section>
  );
}
