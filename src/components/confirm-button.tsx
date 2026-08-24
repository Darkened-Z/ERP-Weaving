"use client";

/**
 * Submit button that asks for confirmation before letting the form post.
 * Drop-in replacement for a plain <button type="submit"> on destructive forms.
 */
export function ConfirmButton({
  children,
  message = "Delete this record? This cannot be undone.",
  className = "btn btn-outline btn-sm",
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
