"use client";

import { useState } from "react";
import { FAQS } from "../_data";

export default function AcademyFaqPage() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  function toggleItem(index: number) {
    setOpenItems((prev) => (
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]
    ));
  }

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <div className="ey ey-gold" style={{ marginBottom: 8 }}>Knowledge Base</div>
        <h1 style={{ fontFamily: "var(--dis)", fontWeight: 800, fontSize: "clamp(1.4rem,3vw,2rem)", letterSpacing: "-.045em", color: "#fff", marginBottom: 7 }}>
          Protocol FAQ
        </h1>
        <p style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.8, maxWidth: 420 }}>
          Architecture, verifications, and reward flows explained in the same academy system language.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FAQS.map((item, index) => {
          const open = openItems.includes(index);
          return (
            <button
              key={item.q}
              type="button"
              className="panel"
              style={{ textAlign: "left", overflow: "hidden" }}
              onClick={() => toggleItem(index)}
            >
              <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t)" }}>{item.q}</div>
                <div style={{ color: "var(--t3)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .18s var(--ease)" }}>
                  ▾
                </div>
              </div>
              {open ? (
                <div style={{ borderTop: "1px solid var(--b1)", padding: "0 16px 16px", fontSize: 12, lineHeight: 1.8, color: "var(--t2)" }}>
                  {item.a}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
