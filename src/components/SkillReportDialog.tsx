import { useI18n } from "../lib/i18n";

type SkillReportDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  reportReason: string;
  reportError: string | null;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function SkillReportDialog({
  isOpen,
  isSubmitting,
  reportReason,
  reportError,
  onReasonChange,
  onCancel,
  onSubmit,
}: SkillReportDialogProps) {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div className="report-dialog-backdrop">
      <div className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <h2 id="report-title" className="section-title" style={{ margin: 0, fontSize: "1.1rem" }}>
          {t("report.skillTitle")}
        </h2>
        <p className="section-subtitle" style={{ margin: 0 }}>
          {t("report.subtitle")}
        </p>
        <form
          className="report-dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <textarea
            className="report-dialog-textarea"
            aria-label={t("report.reasonLabel")}
            placeholder={t("report.reasonPlaceholder")}
            value={reportReason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={5}
            disabled={isSubmitting}
          />
          {reportError ? <p className="report-dialog-error">{reportError}</p> : null}
          <div className="report-dialog-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!isSubmitting) onCancel();
              }}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn" disabled={isSubmitting}>
              {isSubmitting ? t("report.submitting") : t("report.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
