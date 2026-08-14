"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderVendorsAction } from "@/lib/admin-actions";

type Vendor = { id: string; name: string; slug: string };

export function VendorPriorityList({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter();
  const [items, setItems] = useState(() => vendors.map((v) => v.id));
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setSaving(true);
    const result = await reorderVendorsAction(next);
    setSaving(false);
    if (!result.ok) alert(result.error);
    router.refresh();
  }

  const byId = Object.fromEntries(vendors.map((v) => [v.id, v]));

  return (
    <div>
      {saving && <p className="mb-2 text-xs text-gray-500">Saving order…</p>}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {items.map((id, index) => {
              const vendor = byId[id];
              if (!vendor) return null;
              return (
                <PriorityRow
                  key={id}
                  id={id}
                  rank={index + 1}
                  name={vendor.name}
                  slug={vendor.slug}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PriorityRow({ id, rank, name, slug }: { id: string; rank: number; name: string; slug: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      data-testid={`priority-${slug}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span className="w-6 text-center text-sm font-semibold text-gray-400">{rank}</span>
      <button
        type="button"
        aria-label={`Reorder ${name}`}
        className="cursor-grab touch-none rounded px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-gray-500">
          <code>/api/v1/{slug}</code>
        </p>
      </div>
    </li>
  );
}
