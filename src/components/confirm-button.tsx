"use client";

/**
 * Submit button that asks for confirmation before letting the form post.
 * Drop-in replacement for a plain <button type="submit"> on destructive forms.
 */
export function ConfirmButton({
  children,
  message = "Delete this record? This cannot be undone.",
  className = "btn btn-outline btn-sm",
  style,
  title,
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      title={title}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
