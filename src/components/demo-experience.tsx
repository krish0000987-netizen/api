"use client";

import { useState } from "react";
import { QuickDemo } from "./quick-demo";
import { ApiPlayground } from "./api-playground";

export function DemoExperience({
  demoKey,
  demoEmail,
  demoPassword,
}: {
  demoKey: string;
  demoEmail: string;
  demoPassword: string;
}) {
  // The branded key issued by QuickDemo, plus the vendor slug it belongs to.
  const [branded, setBranded] = useState<{ apiKey: string; slug: string } | null>(null);

  const prefix = branded?.slug ?? "sms";
  const examples = [
    `${prefix}/messages`,
    `${prefix}/balance`,
    `${prefix}/templates`,
  ];

  return (
    <>
      <QuickDemo
        onBrandedKey={(apiKey) => setBranded({ apiKey, slug: "demo-vendor" })}
      />
      {/* key= remounts the playground with the fresh branded key prefilled */}
      <ApiPlayground
        key={branded?.apiKey ?? "playground"}
        demoKey={demoKey}
        demoEmail={demoEmail}
        demoPassword={demoPassword}
        initialKey={branded?.apiKey ?? ""}
        initialPath={branded ? `${branded.slug}/messages` : "sms/messages"}
        examples={examples}
      />
    </>
  );
}
