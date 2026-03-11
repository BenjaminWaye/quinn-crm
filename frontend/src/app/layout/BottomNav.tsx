import { NavLink, useParams } from "react-router-dom";

const sections = [
  { id: "overview", label: "Overview", to: "" },
  { id: "crm", label: "CRM", to: "crm" },
  { id: "tasks", label: "Tasks", to: "tasks" },
  { id: "kpi", label: "KPI", to: "kpi" },
  { id: "activity", label: "More", to: "activity" },
];

export function BottomNav() {
  const { productId } = useParams();
  if (!productId) {
    return null;
  }

  return (
    <nav className="bottom-nav" aria-label="Product sections">
      {sections.map((section) => (
        <NavLink
          key={section.id}
          to={`/products/${productId}/${section.to}`.replace(/\/$/, "")}
          end={section.to === ""}
          className={({ isActive }) =>
            `bottom-nav-item ${isActive ? "active" : ""}`
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
