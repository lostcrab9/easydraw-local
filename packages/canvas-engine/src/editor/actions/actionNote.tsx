import { NOTE_COLORS } from "@easydraw/document-model";
import { register } from "./register";
import { changeProperty, getFormValue } from "./actionProperties";
import { CaptureUpdateAction } from "../store";
import { newElementWith } from "../element/mutateElement";
import { isNoteElement } from "../element/typeChecks";
import { t } from "../i18n";

/** Paper colour presets for sticky notes. */
export const actionChangeNoteColor = register({
  name: "changeNoteColor",
  label: "labels.noteColor",
  trackEvent: false,
  perform: (elements, appState, value: string) => ({
    elements: changeProperty(elements, appState, (element) =>
      isNoteElement(element)
        ? newElementWith(element, { backgroundColor: value })
        : element,
    ),
    appState,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  }),
  PanelComponent: ({ elements, appState, updateData }) => {
    const current = getFormValue<string | null>(
      elements,
      appState,
      (element) => (isNoteElement(element) ? element.backgroundColor : null),
      isNoteElement,
      null,
    );
    return (
      <fieldset>
        <legend>{t("labels.noteColor")}</legend>
        <div className="buttonList note-colors">
          {NOTE_COLORS.map(({ id, color }) => {
            const label = t(`labels.noteColors.${id}`);
            const active = current?.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={id}
                type="button"
                className={`note-color${active ? " active" : ""}`}
                title={label}
                aria-label={label}
                aria-pressed={active}
                data-testid={`note-color-${id}`}
                style={{ backgroundColor: color }}
                onClick={() => updateData(color)}
              />
            );
          })}
        </div>
      </fieldset>
    );
  },
});
