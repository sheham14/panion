"use client";

import { useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";

type List = {
  id: string;
  name: string;
  itemCount: number;
};

type Props = {
  lists: List[];
  activeList: List;
  onSwitch: (list: List) => void;
  onCreate: (name: string) => Promise<void>;
};

export default function ListDropdown({
  lists,
  activeList,
  onSwitch,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    await onCreate(newName.trim());
    setNewName("");
    setCreating(false);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[20px] font-medium text-[#111] dark:text-[#e0e0e0]"
      >
        <span className="max-w-[200px] truncate">{activeList.name}</span>
        <ChevronDown
          size={14}
          className="text-[#aaa] flex-shrink-0"
          strokeWidth={1.5}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-8 left-0 w-[220px] bg-white dark:bg-[#1e2528] border border-[#e0e0e0] dark:border-[#2e3538] rounded-2xl shadow-lg z-20 overflow-hidden py-1">
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => {
                  onSwitch(list);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e] transition-colors"
              >
                <div className="text-left">
                  <p className="text-[13px] font-medium text-[#111] dark:text-[#e0e0e0] truncate max-w-[140px]">
                    {list.name}
                  </p>
                  <p className="text-[11px] text-[#aaa]">
                    {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
                {list.id === activeList.id && (
                  <Check
                    size={14}
                    className="text-[#00b89e] flex-shrink-0"
                    strokeWidth={2}
                  />
                )}
              </button>
            ))}

            <div className="border-t border-[#f0f0f0] dark:border-[#2e3538] mt-1 pt-1">
              {creating ? (
                <div className="px-3 py-2 flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="List name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    className="flex-1 text-[13px] bg-transparent text-[#111] dark:text-[#e0e0e0] placeholder-[#bbb] outline-none"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || saving}
                    className="text-[12px] font-medium text-[#00b89e] disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#00b89e] font-medium hover:bg-[#f7f7f7] dark:hover:bg-[#242b2e] transition-colors"
                >
                  <Plus size={14} strokeWidth={2} />
                  New list
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
