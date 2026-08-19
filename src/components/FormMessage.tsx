export function FormMessage({
  error,
  success,
  info,
}: {
  error?: string | null;
  success?: string | null;
  info?: string | null;
}) {
  if (error) {
    return (
      <div className="form-message form-message-error" role="alert">
        {error}
      </div>
    );
  }
  if (success) {
    return (
      <div className="form-message form-message-success" role="status">
        {success}
      </div>
    );
  }
  if (info) {
    return (
      <div className="form-message form-message-info" role="status">
        {info}
      </div>
    );
  }
  return null;
}
