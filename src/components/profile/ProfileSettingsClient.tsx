"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ArrowLeft, ChevronRight, LogOut } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Store = {
  id: string;
  chain: string;
  name: string;
  city: string | null;
};

type InitialData = {
  name: string;
  email: string;
  dietaryRestrictions: string[];
  allergies: string[];
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingOptIn: boolean;
  digestFrequency: string;
  preferredStoreIds: string[];
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 pt-6 pb-2">
      <span className="text-[11px] font-medium text-[#aaa] uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 bg-[#f9f9f9] dark:bg-[#1e2528] rounded-[16px] overflow-hidden">
      {children}
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={[
        "w-[44px] h-[26px] rounded-full transition-colors flex-shrink-0 relative",
        value ? "bg-[#00E5C3]" : "bg-[#ddd] dark:bg-[#3a4044]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[3px] left-0 w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-transform",
          value ? "translate-x-[21px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

function SettingsRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between px-4 py-3.5",
        !last ? "border-b border-[#efefef] dark:border-[#2a3044]" : "",
      ].join(" ")}
    >
      <span className="text-[14px] text-[#111] dark:text-[#e0e0e0]">
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      className={[
        "fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[12px] text-[13px] font-medium shadow-lg",
        "max-w-[320px] text-center",
        type === "success"
          ? "bg-[#00E5C3] text-[#004d40]"
          : "bg-red-500 text-white",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────

function DeleteModal({
  onConfirm,
  onCancel,
  isDeleting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8">
      <div className="w-full max-w-sm bg-white dark:bg-[#1e2528] rounded-[20px] p-5">
        <h3 className="text-[16px] font-semibold text-[#111] dark:text-[#e0e0e0] mb-2">
          Delete account?
        </h3>
        <p className="text-[13px] text-[#666] dark:text-[#aaa] leading-relaxed mb-5">
          Your account and all data will be permanently deleted within 30 days.
          This cannot be undone.
        </p>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="w-full py-3 bg-red-500 text-white rounded-[12px] text-[14px] font-medium mb-2.5 disabled:opacity-50"
        >
          {isDeleting ? "Requesting deletion…" : "Yes, delete my account"}
        </button>
        <button
          onClick={onCancel}
          className="w-full py-3 bg-[#f4f4f4] dark:bg-[#2a3044] text-[#111] dark:text-[#e0e0e0] rounded-[12px] text-[14px] font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProfileSettingsClient({
  initialData,
  stores,
}: {
  initialData: InitialData;
  stores: Store[];
}) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState(initialData.name);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(
    initialData.dietaryRestrictions,
  );
  const [dietaryInput, setDietaryInput] = useState("");

  const addDietary = () => {
    const val = dietaryInput.trim();
    if (!val || dietaryRestrictions.includes(val)) {
      setDietaryInput("");
      return;
    }
    setDietaryRestrictions((prev) => [...prev, val]);
    setDietaryInput("");
  };
  const [allergies, setAllergies] = useState<string[]>(initialData.allergies);
  const [allergyInput, setAllergyInput] = useState("");
  const [preferredStoreIds, setPreferredStoreIds] = useState<string[]>(
    initialData.preferredStoreIds,
  );
  const [emailNotifications, setEmailNotifications] = useState(
    initialData.emailNotifications,
  );

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const allergyInputRef = useRef<HTMLInputElement>(null);

  const isDirty = useMemo(() => {
    if (name !== initialData.name) return true;
    if (emailNotifications !== initialData.emailNotifications) return true;
    const sortedStr = (a: string[]) => JSON.stringify([...a].sort());
    if (sortedStr(dietaryRestrictions) !== sortedStr(initialData.dietaryRestrictions)) return true;
    if (sortedStr(allergies) !== sortedStr(initialData.allergies)) return true;
    if (sortedStr(preferredStoreIds) !== sortedStr(initialData.preferredStoreIds)) return true;
    return false;
  }, [name, emailNotifications, dietaryRestrictions, allergies, preferredStoreIds, initialData]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Dietary restrictions ───────────────────────────────────────────────────

  const toggleDietary = (option: string) => {
    setDietaryRestrictions((prev) =>
      prev.includes(option)
        ? prev.filter((d) => d !== option)
        : [...prev, option],
    );
  };

  // ── Allergies tag input ────────────────────────────────────────────────────

  const addAllergy = () => {
    const val = allergyInput.trim();
    if (!val || allergies.includes(val)) {
      setAllergyInput("");
      return;
    }
    setAllergies((prev) => [...prev, val]);
    setAllergyInput("");
  };

  const removeAllergy = (allergy: string) => {
    setAllergies((prev) => prev.filter((a) => a !== allergy));
  };

  // ── Preferred stores ───────────────────────────────────────────────────────

  const toggleStore = (storeId: string) => {
    setPreferredStoreIds((prev) =>
      prev.includes(storeId)
        ? prev.filter((id) => id !== storeId)
        : [...prev, storeId],
    );
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          dietaryRestrictions,
          allergies,
          preferredStores: preferredStoreIds,
          emailNotifications,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      showToast("Settings saved", "success");
    } catch {
      showToast("Failed to save. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exportData = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/user/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "panion-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "POST" });
      if (!res.ok) throw new Error("Delete failed");
      setShowDeleteModal(false);
      showToast("Deletion requested. Signing you out…", "success");
      setTimeout(async () => {
        await signOut({ callbackUrl: "/" });
      }, 2000);
    } catch {
      showToast("Something went wrong. Please try again.", "error");
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1416] pb-10">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteModal
          onConfirm={deleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}

      {/* Header */}
      <div className="sticky top-safe z-10 bg-white dark:bg-[#0f1416] px-4 pt-4 pb-3 flex items-center gap-3 border-b border-[#f0f0f0] dark:border-[#2a3044]">
        <button
          onClick={() => router.back()}
          className="w-[32px] h-[32px] rounded-[10px] bg-[#f4f4f4] dark:bg-[#242b2e] flex items-center justify-center"
        >
          <ArrowLeft size={16} stroke="#888" strokeWidth={1.5} />
        </button>
        <span className="text-[16px] font-medium text-[#111] dark:text-[#e0e0e0]">
          Profile settings
        </span>
      </div>

      {/* ── Personal ── */}
      <SectionHeader title="Personal" />
      <SettingsCard>
        <div className="px-4 py-3.5 border-b border-[#efefef] dark:border-[#2a3044]">
          <label className="text-[11px] text-[#aaa] font-medium mb-1 block">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-transparent text-[14px] text-[#111] dark:text-[#e0e0e0] outline-none placeholder-[#ccc]"
          />
        </div>
        <div className="px-4 py-3.5">
          <label className="text-[11px] text-[#aaa] font-medium mb-1 block">
            Email
          </label>
          <span className="text-[14px] text-[#aaa]">{initialData.email}</span>
        </div>
      </SettingsCard>

      {/* ── Food preferences ── */}
      <SectionHeader title="Food Preferences" />
      <SettingsCard>
        {/* Dietary restrictions */}
        {/* Dietary restrictions — same pattern as allergies */}
        <div className="px-4 py-3.5 border-b border-[#efefef] dark:border-[#2a3044]">
          <label className="text-[11px] text-[#aaa] font-medium mb-3 block">
            Dietary restrictions
          </label>
          {dietaryRestrictions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {dietaryRestrictions.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[20px] bg-[#f0fdf9] dark:bg-[#1a2e2a] border border-[#00E5C3] text-[12px] font-medium text-[#0a7a62] dark:text-[#00b89e]"
                >
                  {item}
                  <button
                    onClick={() =>
                      setDietaryRestrictions((prev) =>
                        prev.filter((d) => d !== item),
                      )
                    }
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 bg-[#f4f4f4] dark:bg-[#242b2e] rounded-[10px] px-3 py-2">
            <input
              type="text"
              value={dietaryInput}
              onChange={(e) => setDietaryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addDietary();
                }
              }}
              placeholder='e.g. "halal", "no red meat", "low carb"'
              className="flex-1 bg-transparent text-[13px] text-[#111] dark:text-[#e0e0e0] outline-none placeholder-[#bbb]"
            />
            {dietaryInput.trim() && (
              <button
                onClick={addDietary}
                className="text-[11px] font-medium text-[#00b89e]"
              >
                Add
              </button>
            )}
          </div>
        </div>

        {/* Allergies */}
        <div className="px-4 py-3.5">
          <label className="text-[11px] text-[#aaa] font-medium mb-3 block">
            Allergies
          </label>
          {/* Tags */}
          {allergies.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {allergies.map((allergy) => (
                <div
                  key={allergy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[20px] bg-[#fff3cd] dark:bg-[#3a2e00] border border-[#ffc107] text-[12px] font-medium text-[#856404] dark:text-[#ffc107]"
                >
                  {allergy}
                  <button
                    onClick={() => removeAllergy(allergy)}
                    className="opacity-60 hover:opacity-100"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Input */}
          <div className="flex items-center gap-2 bg-[#f4f4f4] dark:bg-[#242b2e] rounded-[10px] px-3 py-2">
            <input
              ref={allergyInputRef}
              type="text"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addAllergy();
                }
              }}
              placeholder="Type an allergy and press Enter"
              className="flex-1 bg-transparent text-[13px] text-[#111] dark:text-[#e0e0e0] outline-none placeholder-[#bbb]"
            />
            {allergyInput.trim() && (
              <button
                onClick={addAllergy}
                className="text-[11px] font-medium text-[#00b89e]"
              >
                Add
              </button>
            )}
          </div>
        </div>
      </SettingsCard>

      {/* ── My stores ── */}
      <SectionHeader title="My Stores" />
      <div className="mx-4 flex flex-col gap-2">
        {stores.map((store) => {
          const active = preferredStoreIds.includes(store.id);
          return (
            <button
              key={store.id}
              onClick={() => toggleStore(store.id)}
              className={[
                "flex items-center justify-between px-4 py-3.5 rounded-[14px] border transition-colors text-left",
                active
                  ? "bg-[#f0fdf9] dark:bg-[#1a2e2a] border-[#00E5C3]"
                  : "bg-[#f9f9f9] dark:bg-[#1e2528] border-transparent",
              ].join(" ")}
            >
              <div>
                <p className="text-[14px] font-medium text-[#111] dark:text-[#e0e0e0]">
                  {store.chain}
                </p>
                {store.city && (
                  <p className="text-[12px] text-[#aaa]">{store.city}</p>
                )}
              </div>
              <div
                className={[
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                  active
                    ? "bg-[#00E5C3] border-[#00E5C3]"
                    : "border-[#ddd] dark:border-[#3a4044]",
                ].join(" ")}
              >
                {active && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5L4.2 7.5L8 3"
                      stroke="#004d40"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Notifications ── */}
      <SectionHeader title="Notifications" />
      <SettingsCard>
        <SettingsRow label="Price alert emails" last>
          <Toggle value={emailNotifications} onChange={setEmailNotifications} />
        </SettingsRow>
      </SettingsCard>

      {/* ── Account ── */}
      <SectionHeader title="Account" />
      <SettingsCard>
        <button
          onClick={exportData}
          disabled={isExporting}
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[#efefef] dark:border-[#2a3044] disabled:opacity-50"
        >
          <span className="text-[14px] text-[#111] dark:text-[#e0e0e0]">
            Export my data
          </span>
          <span className="text-[12px] text-[#aaa]">
            {isExporting ? "Exporting…" : "JSON"}
          </span>
        </button>
        <Link
          href="/feedback"
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[#efefef] dark:border-[#2a3044]"
        >
          <span className="text-[14px] text-[#111] dark:text-[#e0e0e0]">Send feedback</span>
          <ChevronRight size={14} className="text-[#ccc]" />
        </Link>
        <Link
          href="/privacy"
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[#efefef] dark:border-[#2a3044]"
        >
          <span className="text-[14px] text-[#111] dark:text-[#e0e0e0]">Privacy policy</span>
          <ChevronRight size={14} className="text-[#ccc]" />
        </Link>
        <Link
          href="/terms"
          className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[#efefef] dark:border-[#2a3044]"
        >
          <span className="text-[14px] text-[#111] dark:text-[#e0e0e0]">Terms of service</span>
          <ChevronRight size={14} className="text-[#ccc]" />
        </Link>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full flex items-center px-4 py-3.5"
        >
          <span className="text-[14px] text-red-500">Delete account</span>
        </button>
      </SettingsCard>

      {/* ── Sign out ── */}
      <div className="px-4 mt-6">
        <button
          onClick={() => signOut({ callbackUrl: "/signin" })}
          className="w-full py-3.5 rounded-[14px] text-[14px] font-medium text-[#ef4444] border border-[#fecaca] dark:border-[#3a2020] bg-[#fff8f8] dark:bg-[#1e1212] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <LogOut size={15} strokeWidth={1.8} />
          Sign out
        </button>
      </div>

      {/* ── Save button ── */}
      {isDirty && (
        <div className="px-4 mt-3">
          <button
            onClick={save}
            disabled={isSaving}
            className="w-full py-3.5 bg-[#00E5C3] rounded-[14px] text-[14px] font-medium text-[#004d40] disabled:opacity-50 transition-opacity"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
