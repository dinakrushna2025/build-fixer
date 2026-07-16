import React from "react";

export default function PageHeader({ title, subtitle, badge, right }) {
  return (
    <div className="flex items-start justify-between gap-6 pb-6 border-b border-border">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
