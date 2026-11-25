import { useEffect, useRef, useState } from 'react';
import { Utensils, X, AlertCircle } from 'lucide-react';
import type { MealCategory, MealRecord } from '../types/pulse';
import {
  MEAL_CATEGORIES,
  combineLocalDateAndTime,
  toLocalDateKey,
  toLocalTimeInput,
} from '../utils/metrics';

interface MealFormModalProps {
  initialCategory: MealCategory;
  initialDateKey?: string;
  initialMeal?: MealRecord | null;
  onClose: () => void;
  onSave: (meal: Omit<MealRecord, 'createdAt'>, existingId?: string) => Promise<void>;
}

export function MealFormModal({
  initialCategory,
  initialDateKey,
  initialMeal,
  onClose,
  onSave,
}: MealFormModalProps) {
  const isEdit = Boolean(initialMeal);
  const [category, setCategory] = useState<MealCategory>(initialMeal?.category ?? initialCategory);
  const [dateKey, setDateKey] = useState<string>(
    initialMeal ? toLocalDateKey(initialMeal.timestamp) : initialDateKey ?? toLocalDateKey(new Date())
  );
  const [time, setTime] = useState<string>(
    initialMeal ? toLocalTimeInput(initialMeal.timestamp) : toLocalTimeInput(new Date())
  );
  const [title, setTitle] = useState<string>(initialMeal?.title ?? '');
  const [notes, setNotes] = useState<string>(initialMeal?.notes ?? '');
  const [error, setError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const categoryLabel = MEAL_CATEGORIES.find((c) => c.id === category)?.label ?? category;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Please describe what you ate for this meal.');
      return;
    }

    setSaving(true);
    try {
      const timestamp = combineLocalDateAndTime(dateKey, time);
      await onSave(
        {
          id: initialMeal?.id ?? crypto.randomUUID(),
          category,
          title: trimmed,
          timestamp,
          notes: notes.trim(),
        },
        initialMeal?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save meal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <Utensils className="w-4 h-4 text-[var(--accent-primary-text)]" />
            <div>
              <h2 id="meal-modal-title" className="text-lg font-display font-bold text-[var(--text-main)]">
                {isEdit ? `Edit ${categoryLabel}` : `Log ${categoryLabel}`}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Supportive nourishment tracking · local device time
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-main)] transition-colors"
            aria-label="Close meal form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger-border)] px-3.5 py-2.5 text-xs text-[var(--danger-text)]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MEAL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`h-10 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                  category === cat.id
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] border-[var(--accent-primary)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-main)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="modal-meal-title" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              What did you enjoy?
            </label>
            <input
              ref={inputRef}
              id="modal-meal-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${
                category === 'breakfast'
                  ? 'Oatmeal with berries and walnuts'
                  : category === 'lunch'
                    ? 'Grain bowl with greens and roasted chicken'
                    : category === 'dinner'
                      ? 'Baked salmon, sweet potato, steamed broccoli'
                      : 'Greek yogurt with sliced fruit'
              }`}
              maxLength={120}
              required
              className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="modal-meal-date" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Date
              </label>
              <input
                id="modal-meal-date"
                type="date"
                value={dateKey}
                onChange={(e) => setDateKey(e.target.value)}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
              />
            </div>
            <div>
              <label htmlFor="modal-meal-time" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Time
              </label>
              <input
                id="modal-meal-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm font-mono tabular-nums text-[var(--text-main)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-meal-notes" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Reflections (optional)
            </label>
            <input
              id="modal-meal-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Energy, hunger, or how it felt..."
              maxLength={1000}
              className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-secondary)]/70"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-main)] whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-6 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:bg-[var(--accent-primary-hover)] text-sm font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {saving ? 'Saving...' : isEdit ? 'Update Meal' : `Save ${categoryLabel}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
