"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  enableIntegrationAction,
  disableIntegrationAction,
  reorderIntegrationsAction,
} from "@/lib/customer-actions";

type PaletteItem = { vendorId: string; name: string; slug: string };
type CanvasItem = { id: string; vendorId: string; name: string; slug: string };

export function IntegrationBuilder({
  available,
  enabled,
}: {
  available: PaletteItem[];
  enabled: CanvasItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(() => enabled.map((e) => e.id));
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  const byId = useMemo(() => Object.fromEntries(enabled.map((e) => [e.id, e])), [enabled]);

  // Keep the canvas in sync with the server. After enable/remove/reorder we
  // call router.refresh(), which returns fresh `enabled` props — without this
  // the client-side items list would go stale (e.g. a newly enabled service
  // wouldn't appear until a full page reload). Local drag reorders win until
  // the refresh lands, since `enabled` only changes when the server re-renders.
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    setItems(enabled.map((e) => e.id));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("palette-")) {
      // A palette block dropped onto the canvas (or an existing item) → enable.
      if (overId === "canvas" || items.includes(overId)) {
        const vendorId = activeId.slice("palette-".length);
        await enableIntegrationAction(vendorId);
        router.refresh();
      }
      return;
    }

    // Reorder within the canvas.
    if (activeId === overId) return;
    const oldIndex = items.indexOf(activeId);
    const newIndex = items.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    await reorderIntegrationsAction(next);
    router.refresh();
  }

  async function add(vendorId: string) {
    await enableIntegrationAction(vendorId);
    router.refresh();
  }

  async function remove(vendorId: string) {
    await disableIntegrationAction(vendorId);
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Palette */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-1 text-lg font-semibold">Available services</h2>
          <p className="mb-4 text-sm text-gray-500">
            Drag a service onto the canvas to enable it, or click Add.
          </p>
          {available.length === 0 ? (
            <p className="text-sm text-gray-500">
              No services available yet — the admin adds them in the Vendor Key
              Vault.
            </p>
          ) : (
            <div className="space-y-2">
              {available.map((vendor) => (
                <PaletteBlock key={vendor.vendorId} vendor={vendor} onAdd={() => add(vendor.vendorId)} />
              ))}
            </div>
          )}
        </section>

        {/* Canvas */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-1 text-lg font-semibold">Your integrations</h2>
          <p className="mb-4 text-sm text-gray-500">
            Drag to reorder, or use the handle with your keyboard.
          </p>
          <CanvasDrop isEmpty={items.length === 0}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              {items.map((id) => {
                const item = byId[id];
                return item ? (
                  <CanvasIntegration key={id} item={item} onRemove={() => remove(item.vendorId)} />
                ) : null;
              })}
            </SortableContext>
          </CanvasDrop>
        </section>
      </div>
    </DndContext>
  );
}

function PaletteBlock({ vendor, onAdd }: { vendor: PaletteItem; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${vendor.vendorId}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`palette-${vendor.slug}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900 ${
        isDragging ? "opacity-50" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{vendor.name}</p>
        <p className="truncate text-xs text-gray-500">
          <code>/api/v1/{vendor.slug}</code>
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        Add
      </button>
    </div>
  );
}

function CanvasDrop({ isEmpty, children }: { isEmpty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });
  return (
    <div
      ref={setNodeRef}
      data-testid="canvas"
      className={`min-h-40 rounded-lg border-2 border-dashed p-3 transition ${
        isOver
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
          : "border-gray-300 dark:border-gray-700"
      }`}
    >
      {isEmpty ? (
        <p className="py-12 text-center text-sm text-gray-400">
          Drag a service here to enable it
        </p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function CanvasIntegration({ item, onRemove }: { item: CanvasItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={`canvas-item-${item.slug}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label={`Reorder ${item.name}`}
          className="cursor-grab touch-none rounded px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-gray-500">
            <code>/api/v1/{item.slug}</code>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        Remove
      </button>
    </div>
  );
}
