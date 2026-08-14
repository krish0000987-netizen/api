"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Widget } from "@/lib/widgets";

function WidgetCard({ id, label, value }: Widget) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-testid={`widget-${id}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "z-10 opacity-60" : ""}
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-500">{label}</p>
          <button
            type="button"
            aria-label={`Reorder ${label}`}
            className="cursor-grab touch-none rounded px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        </div>
        <p className="mt-1 text-3xl font-bold capitalize">{value}</p>
      </div>
    </div>
  );
}

export function SortableWidgetGrid({
  widgets,
  onReorder,
}: {
  widgets: Widget[];
  onReorder: (ids: string[]) => Promise<unknown>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(() => widgets.map((w) => w.id));
  const byId = useMemo(() => Object.fromEntries(widgets.map((w) => [w.id, w])), [widgets]);

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
    await onReorder(next);
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="grid gap-4 sm:grid-cols-3">
          {items.map((id) => {
            const widget = byId[id];
            return widget ? <WidgetCard key={id} {...widget} /> : null;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
