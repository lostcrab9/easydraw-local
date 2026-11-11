import { useState, type ReactNode } from "react";
import {
  ARROWHEAD_OPTIONS,
  DEFAULT_ELEMENT_DEFAULTS,
  type ElementDefaults,
  type ElementDefaultsKind,
} from "@easydraw/canvas-engine";
import { NOTE_COLORS } from "@easydraw/document-model";

type Translate = (key: string, values?: Record<string, string | number>) => string;

interface Props {
  open: boolean;
  onClose: () => void;
  t: Translate;
  defaults: ElementDefaults;
  onChange: (next: ElementDefaults) => void;
}

const KINDS: ReadonlyArray<{ kind: ElementDefaultsKind; label: string; hint: string }> = [
  { kind: "frame", label: "容器", hint: "新建页面容器（Frame）" },
  { kind: "text", label: "文本", hint: "文字工具与双击画布创建的文字" },
  { kind: "shape", label: "矢量图形", hint: "矩形、菱形、椭圆和线条" },
  { kind: "arrow", label: "箭头", hint: "连接线与指示箭头" },
  { kind: "note", label: "便签", hint: "原型说明用的便签" },
  { kind: "icon", label: "图标", hint: "从图标库插入或粘贴的 SVG 图标" },
  { kind: "freedraw", label: "自由书写", hint: "画笔笔迹" },
];

const NOTE_COLOR_LABELS: Record<string, string> = { yellow: "黄色", blue: "蓝色", green: "绿色", pink: "粉色", gray: "灰色" };
const STROKE_PICKS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#868e96"];
const FILL_PICKS = ["transparent", "#ffffff", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#e9ecef"];
const FONT_FAMILIES = [
  { value: 6, label: "Nunito" },
  { value: 2, label: "Helvetica" },
  { value: 3, label: "Cascadia" },
  { value: 5, label: "Excalifont" },
];

/** Defaults for new elements, per kind. Changes apply immediately and are saved on this device. */
export function PreferencesDialog({ open, onClose, t, defaults, onChange }: Props) {
  const [active, setActive] = useState<ElementDefaultsKind>("frame");
  if (!open) return null;
  const current = KINDS.find((item) => item.kind === active)!;
  const set = <K extends ElementDefaultsKind>(kind: K, patch: Partial<ElementDefaults[K]>) =>
    onChange({ ...defaults, [kind]: { ...defaults[kind], ...patch } });

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
    >
      <section className="settings-dialog preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-dialog-title">
        <div className="dialog-heading settings-dialog__heading">
          <div>
            <h2 id="preferences-dialog-title">{t("偏好设置")}</h2>
            <p>{t("新建元素的默认样式。每类元素互不影响，修改立即生效并保存在本机。")}</p>
          </div>
          <button className="dialog-close" onClick={onClose} aria-label={t("关闭偏好设置")}>×</button>
        </div>
        <div className="preferences-dialog__body">
          <nav className="preferences-nav" aria-label={t("元素类型")}>
            {KINDS.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={item.kind === active ? "preferences-nav__item is-active" : "preferences-nav__item"}
                aria-current={item.kind === active ? "page" : undefined}
                data-testid={`preferences-kind-${item.kind}`}
                onClick={() => setActive(item.kind)}
              >
                {t(item.label)}
              </button>
            ))}
          </nav>
          <div className="preferences-panel">
            <div className="preferences-panel__heading">
              <div>
                <h3>{t(current.label)}</h3>
                <p>{t(current.hint)}</p>
              </div>
              <Preview kind={active} defaults={defaults} />
            </div>
            <div className="preferences-fields">
              {active === "frame" && <>
                <Field label={t("背景")}>
                  <ColorPicker t={t} value={defaults.frame.backgroundColor} picks={FILL_PICKS} allowTransparent onChange={(backgroundColor) => set("frame", { backgroundColor })} />
                </Field>
                <Field label={t("边角")}>
                  <Segmented value={defaults.frame.rounded} options={[[false, t("直角")], [true, t("圆角")]]} onChange={(rounded) => set("frame", { rounded })} />
                </Field>
              </>}
              {active === "text" && <>
                <Field label={t("文字颜色")}>
                  <ColorPicker t={t} value={defaults.text.strokeColor} picks={STROKE_PICKS} onChange={(strokeColor) => set("text", { strokeColor })} />
                </Field>
                <Field label={t("字号")}>
                  <NumberInput value={defaults.text.fontSize} min={8} max={160} onChange={(fontSize) => set("text", { fontSize })} />
                </Field>
                <Field label={t("字体")}>
                  <Segmented value={defaults.text.fontFamily} options={FONT_FAMILIES.map(({ value, label }) => [value, label] as const)} onChange={(fontFamily) => set("text", { fontFamily })} />
                </Field>
                <Field label={t("对齐")}>
                  <AlignInput t={t} value={defaults.text.textAlign} onChange={(textAlign) => set("text", { textAlign })} />
                </Field>
              </>}
              {active === "shape" && <>
                <Field label={t("描边")}>
                  <ColorPicker t={t} value={defaults.shape.strokeColor} picks={STROKE_PICKS} allowTransparent onChange={(strokeColor) => set("shape", { strokeColor })} />
                </Field>
                <Field label={t("填充")}>
                  <ColorPicker t={t} value={defaults.shape.backgroundColor} picks={FILL_PICKS} allowTransparent onChange={(backgroundColor) => set("shape", { backgroundColor })} />
                </Field>
                <StrokeFields t={t} width={defaults.shape.strokeWidth} style={defaults.shape.strokeStyle} roughness={defaults.shape.roughness}
                  onChange={(patch) => set("shape", patch)} />
                <Field label={t("边角")}>
                  <Segmented value={defaults.shape.roundness} options={[["sharp", t("直角")], ["round", t("圆角")]]} onChange={(roundness) => set("shape", { roundness })} />
                </Field>
              </>}
              {active === "arrow" && <>
                <Field label={t("颜色")}>
                  <ColorPicker t={t} value={defaults.arrow.strokeColor} picks={STROKE_PICKS} onChange={(strokeColor) => set("arrow", { strokeColor })} />
                </Field>
                <StrokeFields t={t} width={defaults.arrow.strokeWidth} style={defaults.arrow.strokeStyle} roughness={defaults.arrow.roughness}
                  onChange={(patch) => set("arrow", patch)} />
                <Field label={t("箭头类型")}>
                  <Segmented value={defaults.arrow.arrowType} options={[["elbow", t("肘形")], ["round", t("曲线")], ["sharp", t("直线")]]} onChange={(arrowType) => set("arrow", { arrowType })} />
                </Field>
                <Field label={t("起点")}>
                  <ArrowheadSelect t={t} value={defaults.arrow.startArrowhead} onChange={(startArrowhead) => set("arrow", { startArrowhead })} />
                </Field>
                <Field label={t("终点")}>
                  <ArrowheadSelect t={t} value={defaults.arrow.endArrowhead} onChange={(endArrowhead) => set("arrow", { endArrowhead })} />
                </Field>
              </>}
              {active === "note" && <>
                <Field label={t("便签颜色")}>
                  <div className="preferences-swatches" role="radiogroup" aria-label={t("便签颜色")}>
                    {NOTE_COLORS.map(({ id, color }) => (
                      <Swatch key={id} color={color} label={t(NOTE_COLOR_LABELS[id])} selected={defaults.note.backgroundColor.toLowerCase() === color.toLowerCase()}
                        onSelect={() => set("note", { backgroundColor: color })} />
                    ))}
                  </div>
                </Field>
                <Field label={t("字号")}>
                  <NumberInput value={defaults.note.fontSize} min={8} max={160} onChange={(fontSize) => set("note", { fontSize })} />
                </Field>
                <Field label={t("对齐")}>
                  <AlignInput t={t} value={defaults.note.textAlign} onChange={(textAlign) => set("note", { textAlign })} />
                </Field>
              </>}
              {active === "icon" && <>
                <Field label={t("图标颜色")}>
                  <ColorPicker t={t} value={defaults.icon.strokeColor} picks={STROKE_PICKS} onChange={(strokeColor) => set("icon", { strokeColor })} />
                </Field>
                <Field label={t("尺寸")} hint={t("插入时较长一边的像素")}>
                  <NumberInput value={defaults.icon.size} min={12} max={256} onChange={(size) => set("icon", { size })} />
                </Field>
              </>}
              {active === "freedraw" && <>
                <Field label={t("颜色")}>
                  <ColorPicker t={t} value={defaults.freedraw.strokeColor} picks={STROKE_PICKS} onChange={(strokeColor) => set("freedraw", { strokeColor })} />
                </Field>
                <Field label={t("粗细")}>
                  <Segmented value={defaults.freedraw.strokeWidth} options={[[1, t("细")], [2, t("中")], [4, t("粗")]]} onChange={(strokeWidth) => set("freedraw", { strokeWidth })} />
                </Field>
              </>}
            </div>
          </div>
        </div>
        <div className="dialog-actions settings-dialog__actions preferences-dialog__actions">
          <button
            className="secondary-action"
            onClick={() => onChange({ ...defaults, [active]: structuredClone(DEFAULT_ELEMENT_DEFAULTS[active]) })}
          >
            {t("恢复{kind}默认值", { kind: t(current.label) })}
          </button>
          <button className="primary-action" onClick={onClose}>{t("完成")}</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="preferences-field">
      <div className="preferences-field__label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="preferences-field__control">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number | boolean>({ value, options, onChange }: {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="preferences-segmented" role="radiogroup">
      {options.map(([option, label]) => (
        <button
          key={String(option)}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? "is-selected" : undefined}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Swatch({ color, label, selected, onSelect }: { color: string; label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      className={`preferences-swatch${selected ? " is-selected" : ""}${color === "transparent" ? " is-transparent" : ""}`}
      style={color === "transparent" ? undefined : { backgroundColor: color }}
      onClick={onSelect}
    />
  );
}

function ColorPicker({ t, value, picks, allowTransparent = false, onChange }: {
  t: Translate;
  value: string;
  picks: string[];
  allowTransparent?: boolean;
  onChange: (color: string) => void;
}) {
  const options = picks.filter((color) => allowTransparent || color !== "transparent");
  const custom = !options.some((color) => color.toLowerCase() === value.toLowerCase());
  return (
    <div className="preferences-swatches" role="radiogroup">
      {options.map((color) => (
        <Swatch key={color} color={color} label={color === "transparent" ? t("无") : color}
          selected={color.toLowerCase() === value.toLowerCase()} onSelect={() => onChange(color)} />
      ))}
      <label className={`preferences-swatch preferences-swatch--custom${custom ? " is-selected" : ""}`} title={t("自定义颜色")}
        style={custom && value !== "transparent" ? { backgroundColor: value } : undefined}>
        <input type="color" aria-label={t("自定义颜色")} value={value === "transparent" ? "#ffffff" : value}
          onChange={(event) => onChange(event.target.value)} />
      </label>
      <span className="preferences-color-value">{value === "transparent" ? t("无") : value.toUpperCase()}</span>
    </div>
  );
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) { setSynced(value); setDraft(String(value)); }
  const commit = () => {
    const next = Math.round(Number(draft));
    if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
    else setDraft(String(value));
  };
  return (
    <input
      className="preferences-number"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
    />
  );
}

function AlignInput({ t, value, onChange }: { t: Translate; value: string; onChange: (value: "left" | "center" | "right") => void }) {
  return <Segmented<string> value={value} options={[["left", t("左对齐")], ["center", t("居中")], ["right", t("右对齐")]]}
    onChange={(next) => onChange(next as "left" | "center" | "right")} />;
}

function StrokeFields({ t, width, style, roughness, onChange }: {
  t: Translate;
  width: number;
  style: "solid" | "dashed" | "dotted";
  roughness: number;
  onChange: (patch: { strokeWidth?: number; strokeStyle?: "solid" | "dashed" | "dotted"; roughness?: number }) => void;
}) {
  return <>
    <Field label={t("描边宽度")}>
      <Segmented value={width} options={[[1, t("细")], [2, t("中")], [4, t("粗")]]} onChange={(strokeWidth) => onChange({ strokeWidth })} />
    </Field>
    <Field label={t("线型")}>
      <Segmented value={style} options={[["solid", t("实线")], ["dashed", t("虚线")], ["dotted", t("点线")]]} onChange={(strokeStyle) => onChange({ strokeStyle })} />
    </Field>
    <Field label={t("风格")}>
      <Segmented value={roughness} options={[[0, t("规整")], [1, t("手绘")], [2, t("潦草")]]} onChange={(next) => onChange({ roughness: next })} />
    </Field>
  </>;
}

const ARROWHEAD_LABELS: Record<string, string> = {
  arrow: "箭头", bar: "竖线", circle: "实心圆", circle_outline: "空心圆", triangle: "实心三角",
  triangle_outline: "空心三角", diamond: "实心菱形", diamond_outline: "空心菱形",
};

function ArrowheadSelect({ t, value, onChange }: { t: Translate; value: string | null; onChange: (value: (typeof ARROWHEAD_OPTIONS)[number] | null) => void }) {
  return (
    <select className="preferences-select" value={value ?? ""}
      onChange={(event) => onChange(event.target.value ? event.target.value as (typeof ARROWHEAD_OPTIONS)[number] : null)}>
      <option value="">{t("无")}</option>
      {ARROWHEAD_OPTIONS.map((head) => <option key={head} value={head}>{t(ARROWHEAD_LABELS[head] ?? head)}</option>)}
    </select>
  );
}

/** A small live sample of the selected kind, so the effect is visible before drawing. */
function Preview({ kind, defaults }: { kind: ElementDefaultsKind; defaults: ElementDefaults }) {
  const dash = (style: string, width: number) => style === "dashed" ? `${width * 4} ${width * 3}` : style === "dotted" ? `${width} ${width * 2.5}` : undefined;
  const fill = (color: string) => color === "transparent" ? "none" : color;
  let body: ReactNode;
  if (kind === "frame") {
    const style = defaults.frame;
    body = <rect x="14" y="8" width="92" height="56" rx={style.rounded ? 10 : 0} fill={fill(style.backgroundColor)} stroke="#bbbbbb" strokeWidth="1.5" />;
  } else if (kind === "text") {
    const style = defaults.text;
    const anchor = style.textAlign === "center" ? "middle" : style.textAlign === "right" ? "end" : "start";
    const x = style.textAlign === "center" ? 60 : style.textAlign === "right" ? 108 : 12;
    body = <text x={x} y="44" textAnchor={anchor} fill={style.strokeColor} fontSize={Math.min(28, style.fontSize)}>Aa 文本</text>;
  } else if (kind === "shape") {
    const style = defaults.shape;
    body = <rect x="22" y="12" width="76" height="48" rx={style.roundness === "round" ? 10 : 0} fill={fill(style.backgroundColor)}
      stroke={fill(style.strokeColor)} strokeWidth={style.strokeWidth} strokeDasharray={dash(style.strokeStyle, style.strokeWidth)} />;
  } else if (kind === "arrow") {
    const style = defaults.arrow;
    // Elbow arrows render with rounded bends on the canvas, so the sample does too.
    const path = style.arrowType === "elbow" ? "M16 54 H52 Q60 54 60 46 V28 Q60 20 68 20 H100" : style.arrowType === "round" ? "M16 54 C50 54 60 20 100 20" : "M16 54 L100 20";
    body = <>
      <defs><marker id="pref-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="none" stroke={style.strokeColor} strokeWidth="1.5" /></marker></defs>
      <path d={path} fill="none" stroke={style.strokeColor} strokeWidth={style.strokeWidth} strokeDasharray={dash(style.strokeStyle, style.strokeWidth)}
        markerEnd={style.endArrowhead ? "url(#pref-arrow)" : undefined} markerStart={style.startArrowhead ? "url(#pref-arrow)" : undefined} />
    </>;
  } else if (kind === "note") {
    const style = defaults.note;
    body = <>
      <rect x="24" y="12" width="72" height="50" rx="5" fill="rgba(15,23,42,0.08)" transform="translate(0 2)" />
      <rect x="24" y="12" width="72" height="50" rx="5" fill={style.backgroundColor} />
      <rect x="32" y="22" width="44" height="4" rx="2" fill="#1f2937" opacity="0.55" />
      <rect x="32" y="32" width="54" height="4" rx="2" fill="#1f2937" opacity="0.35" />
    </>;
  } else if (kind === "icon") {
    const style = defaults.icon;
    const s = Math.min(56, style.size);
    body = <g transform={`translate(${60 - s / 2} ${36 - s / 2}) scale(${s / 24})`} fill="none" stroke={style.strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </g>;
  } else {
    const style = defaults.freedraw;
    body = <path d="M14 50 C30 20 44 60 60 34 S90 18 106 42" fill="none" stroke={style.strokeColor} strokeWidth={style.strokeWidth * 1.5} strokeLinecap="round" />;
  }
  return <svg className="preferences-preview" viewBox="0 0 120 72" aria-hidden="true">{body}</svg>;
}
