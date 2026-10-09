"use client";

import {
  decodeCsv,
  findHeaderRow,
  guessColumns,
  IMPORT_FIELDS,
  matchMenus,
  matchOptionWords,
  parseCsv,
  readSaleRows,
  resolveOptionWords,
  SALE_IMPORT_MAX_ROWS,
  summarizeNames,
  summarizeOptionWords,
  type ImportColumns,
  type ImportField,
  type OptionWordChoice,
} from "@cafe/core";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, NativeSelect } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cancelImportAction, importChunkAction, startImportAction, type ImportRowInput } from "./actions";

/** 서버로 한 번에 보내는 행 수 (lib/api/sale-imports 의 IMPORT_CHUNK_SIZE 와 같게) */
const CHUNK = 500;
/** 메뉴를 고르지 않은 상태 / 가져오지 않음 */
const UNSET = "";
const SKIP = "skip";
/** 옵션 낱말 고르기 값: 메뉴 이름에 붙임 / 무시 / "option:<id>" */
const WORD_MENU = "menu";
const WORD_IGNORE = "ignore";
const wordValue = (c: OptionWordChoice) => (c.kind === "option" ? `option:${c.optionId}` : c.kind);
const wordChoice = (v: string): OptionWordChoice =>
  v.startsWith("option:") ? { kind: "option", optionId: v.slice(7) } : { kind: v === WORD_IGNORE ? "ignore" : "menu" };

interface LoadedFile {
  name: string;
  table: string[][];
  headerIndex: number;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function SalesImportWizard({
  menus,
  aliases,
  options,
  optionAliases,
  today,
}: {
  menus: { id: string; name: string; price: number }[];
  /** 저장해 둔 메뉴 이름 매칭 */
  aliases: Record<string, string | null>;
  /** 판매 중인 옵션 */
  options: { id: string; name: string; price: number }[];
  /** 저장해 둔 옵션 열 낱말 매칭 */
  optionAliases: Record<string, OptionWordChoice>;
  /** 매장 시간대 기준 오늘 YYYY-MM-DD */
  today: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [columns, setColumns] = useState<ImportColumns>({});
  /** 사용자가 고른 매칭 (파일 이름 → 메뉴 id, SKIP, UNSET) */
  const [choices, setChoices] = useState<Record<string, string>>({});
  /** 사용자가 고른 옵션 낱말 매칭 (낱말 → wordValue) */
  const [wordChoices, setWordChoices] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inputKey, setInputKey] = useState(0);

  const header = file ? (file.table[file.headerIndex] ?? []) : [];
  const parsed = useMemo(
    () => (file ? readSaleRows(file.table, file.headerIndex, columns) : { rows: [], issues: [] }),
    [file, columns],
  );
  const missingColumns = IMPORT_FIELDS.filter((f) => f.required && columns[f.field] === undefined);
  // 미래 날짜는 가져올 수 없다
  const futureCount = parsed.rows.filter((r) => r.date > today).length;
  const fileRows = useMemo(() => parsed.rows.filter((r) => r.date <= today), [parsed, today]);

  // 옵션 열 낱말: 저장한 매칭 → 같은 이름의 옵션 → 기본은 "메뉴 이름에 붙임" (옵션 기능 전과 같은 동작)
  const words = useMemo(() => summarizeOptionWords(fileRows), [fileRows]);
  const autoWords = useMemo(
    () => matchOptionWords(words.map((w) => w.name), options, optionAliases),
    [words, options, optionAliases],
  );
  const wordValueOf = (word: string): string =>
    word in wordChoices ? wordChoices[word]! : wordValue(autoWords[word] ?? { kind: "menu" });
  // 행마다 메뉴 매칭 이름(메뉴 + 메뉴 이름에 붙인 낱말)과 옵션
  const rows = useMemo(
    () =>
      fileRows.map((r) => {
        const { menuKey, optionIds } = resolveOptionWords(r, (w) =>
          wordChoice(w in wordChoices ? wordChoices[w]! : wordValue(autoWords[w] ?? { kind: "menu" })),
        );
        return { ...r, name: menuKey, optionIds };
      }),
    [fileRows, wordChoices, autoWords],
  );
  const names = useMemo(() => summarizeNames(rows), [rows]);
  const autoMatch = useMemo(
    () =>
      matchMenus(
        names.map((n) => n.name),
        menus,
        aliases,
      ),
    [names, menus, aliases],
  );
  const choiceOf = (name: string): string => {
    if (name in choices) return choices[name]!;
    const auto = autoMatch[name];
    return auto === undefined ? UNSET : auto === null ? SKIP : auto;
  };
  const unmatched = names.filter((n) => choiceOf(n.name) === UNSET);
  const toImport = rows.filter((r) => ![UNSET, SKIP].includes(choiceOf(r.name)));
  const priceOf = new Map([...menus, ...options].map((m) => [m.id, m.price]));
  const totalQuantity = toImport.reduce((sum, r) => sum + r.quantity, 0);
  const unitPriceOf = (r: (typeof rows)[number]) =>
    (priceOf.get(choiceOf(r.name)) ?? 0) + r.optionIds.reduce((sum, id) => sum + (priceOf.get(id) ?? 0), 0);
  const totalAmount = toImport.reduce((sum, r) => sum + (r.amount ?? unitPriceOf(r) * r.quantity), 0);
  const withOptions = toImport.filter((r) => r.optionIds.length > 0).length;
  const dates = toImport.map((r) => r.date).sort();
  const refundCount = rows.filter((r) => r.quantity < 0).length;
  const importRefunds = toImport.filter((r) => r.quantity < 0).length;

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const table = parseCsv(decodeCsv(new Uint8Array(await f.arrayBuffer())));
      if (table.length < 2) throw new Error("판매 행이 없는 파일입니다.");
      if (table.length > SALE_IMPORT_MAX_ROWS + 10) {
        throw new Error(`한 파일은 ${SALE_IMPORT_MAX_ROWS.toLocaleString("ko-KR")}줄까지 가져올 수 있습니다. 기간을 나눠 주세요.`);
      }
      const headerIndex = findHeaderRow(table);
      setFile({ name: f.name, table, headerIndex });
      setColumns(guessColumns(table[headerIndex] ?? []));
      setChoices({});
      setWordChoices({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "파일을 읽을 수 없습니다. CSV 파일인지 확인해 주세요.");
    }
  }

  function reset() {
    setFile(null);
    setColumns({});
    setChoices({});
    setWordChoices({});
    setInputKey((k) => k + 1);
  }

  function runImport() {
    if (!file) return;
    startTransition(async () => {
      const aliasMap = Object.fromEntries(
        names.map((n) => [n.name, choiceOf(n.name) === SKIP ? null : choiceOf(n.name)] as const),
      );
      const wordMap = Object.fromEntries(words.map((w) => [w.name, wordChoice(wordValueOf(w.name))] as const));
      const started = await startImportAction(file.name, aliasMap, wordMap);
      if (!started.importId) {
        toast.error(started.error ?? "가져오기를 시작하지 못했습니다.");
        return;
      }
      const payload: ImportRowInput[] = toImport.map((r) => ({
        menuId: choiceOf(r.name),
        quantity: r.quantity,
        amount: r.amount,
        date: r.date,
        time: r.time,
        key: r.key,
        optionIds: r.optionIds,
      }));
      let inserted = 0;
      let beforeCount = 0;
      let lastCountDay = "";
      for (let i = 0; i < payload.length; i += CHUNK) {
        setProgress(`가져오는 중… ${i.toLocaleString("ko-KR")} / ${payload.length.toLocaleString("ko-KR")}`);
        const result = await importChunkAction(started.importId, payload.slice(i, i + CHUNK));
        if (result.error) {
          setProgress(null);
          router.refresh();
          toast.error(
            i === 0
              ? result.error
              : `${result.error} (${inserted.toLocaleString("ko-KR")}건까지 가져왔습니다. 고친 뒤 같은 파일을 다시 올리면 남은 것만 가져옵니다.)`,
            { duration: 12_000 },
          );
          return;
        }
        inserted += result.inserted ?? 0;
        beforeCount += result.beforeCount ?? 0;
        lastCountDay = result.lastCountDay ?? lastCountDay;
      }
      setProgress(null);
      const skipped = payload.length - inserted;
      if (inserted === 0) {
        // 모두 이미 가져온 판매면 빈 가져오기 기록은 지운다.
        const form = new FormData();
        form.set("importId", started.importId);
        await cancelImportAction(undefined, form);
        toast.info("이 파일의 판매는 모두 이미 가져왔습니다.");
      } else {
        const notes = [
          skipped > 0 && `이미 가져온 ${skipped.toLocaleString("ko-KR")}건은 건너뛰었습니다.`,
          beforeCount > 0 &&
            `실사(${lastCountDay}) 이전 판매 ${beforeCount.toLocaleString("ko-KR")}줄은 그 실사에서 센 품목의 재고를 빼지 않았습니다. 이미 센 수량에 반영돼 있습니다. 매출과 리포트에는 들어갑니다.`,
        ].filter(Boolean);
        toast.success(`${inserted.toLocaleString("ko-KR")}건을 가져왔습니다.`, {
          description: notes.length > 0 ? notes.join("\n") : undefined,
          duration: beforeCount > 0 ? 12_000 : 8_000,
          classNames: { description: "whitespace-pre-line" },
        });
      }
      reset();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. 파일 선택</CardTitle>
          <CardDescription>
            한 줄에 메뉴 하나의 판매(날짜, 메뉴 이름, 수량, 금액)가 있는 CSV 파일. 엑셀 파일은 엑셀에서 &quot;다른 이름으로
            저장 → CSV&quot; 로 저장해 주세요. (예: 토스 포스 매출 엑셀의 &quot;상품 주문&quot; 시트)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            key={inputKey}
            id="import-file"
            type="file"
            accept=".csv,.txt,text/csv"
            aria-label="판매 파일"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={pending}
          />
          {file && (
            <p className="text-sm text-muted-foreground">
              {file.name} · {(file.table.length - file.headerIndex - 1).toLocaleString("ko-KR")}줄
            </p>
          )}
        </CardContent>
      </Card>

      {file && (
        <Card>
          <CardHeader>
            <CardTitle>2. 열 맞추기</CardTitle>
            <CardDescription>
              열 이름으로 자동으로 골랐습니다. 다르면 바꿔 주세요. 금액 열이 없으면 메뉴 가격 × 수량으로, 시각이 없으면 그
              날 마감 시각으로 기록합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {IMPORT_FIELDS.map(({ field, label, required }) => (
                <Field key={field} label={`${label}${required ? "" : " (선택)"}`} htmlFor={`col-${field}`}>
                  <NativeSelect
                    id={`col-${field}`}
                    value={columns[field] ?? ""}
                    onChange={(e) =>
                      setColumns((c) => {
                        const next = { ...c };
                        if (e.target.value === "") delete next[field as ImportField];
                        else next[field as ImportField] = Number(e.target.value);
                        return next;
                      })
                    }
                    disabled={pending}
                  >
                    <option value="">{required ? "골라 주세요" : "없음"}</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `${i + 1}번째 열`}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ))}
            </div>

            {missingColumns.length > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                {missingColumns.map((f) => f.label).join(", ")} 열을 골라 주세요.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">읽은 판매 미리보기</caption>
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="hidden px-3 py-2 font-medium sm:table-cell">줄</th>
                        <th className="px-3 py-2 font-medium">날짜</th>
                        <th className="px-3 py-2 font-medium">메뉴 이름</th>
                        <th className="px-3 py-2 text-right font-medium">수량</th>
                        <th className="px-3 py-2 text-right font-medium">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsed.rows.slice(0, 5).map((r) => (
                        <tr key={r.key}>
                          <td className="hidden px-3 py-1.5 tabular-nums text-muted-foreground sm:table-cell">{r.line}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                            {r.date} {r.time?.slice(0, 5)}
                          </td>
                          <td className="px-3 py-1.5">{r.name}</td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                            {r.quantity.toLocaleString("ko-KR")}
                            {r.quantity < 0 && <span className="ml-1 text-xs text-destructive">취소</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                            {r.amount === null ? "메뉴 가격" : won(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm">
                  판매 {parsed.rows.length.toLocaleString("ko-KR")}줄을 읽었습니다.
                  {parsed.issues.length > 0 && ` 읽지 않은 줄 ${parsed.issues.length.toLocaleString("ko-KR")}개.`}
                  {futureCount > 0 && ` 미래 날짜 ${futureCount.toLocaleString("ko-KR")}줄은 빼고 가져옵니다.`}
                </p>
                {refundCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    취소·반품 {refundCount.toLocaleString("ko-KR")}줄은 매출에서 빼고 재료를 되돌립니다. 상태가
                    &quot;취소&quot;인 주문은 판매와 취소를 함께 기록해 0이 되고, 예전에 가져온 같은 주문도 취소됩니다.
                  </p>
                )}
                {parsed.issues.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">읽지 않은 줄 보기</summary>
                    <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                      {parsed.issues.slice(0, 50).map((issue) => (
                        <li key={issue.line}>
                          {issue.line}번째 줄: {issue.reason}
                        </li>
                      ))}
                      {parsed.issues.length > 50 && <li>외 {parsed.issues.length - 50}줄</li>}
                    </ul>
                  </details>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {file && missingColumns.length === 0 && words.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. 옵션 맞추기</CardTitle>
            <CardDescription>
              옵션 열의 낱말마다 어떻게 볼지 골라 주세요. 옵션을 고르면 그 옵션의 재료 규칙대로 차감합니다. ICE·HOT 처럼 메뉴를
              가르는 말은 &quot;메뉴 이름에 붙임&quot; (다음 단계에서 &quot;아메리카노 / ICE&quot; 를 메뉴와 맞춥니다), 재료와
              상관없는 것은 &quot;무시&quot;. 고른 것은 저장해 두고 다음에 자동으로 맞춥니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {words.map((w) => {
                const value = wordValueOf(w.name);
                const auto = !(w.name in wordChoices) && autoWords[w.name] !== undefined;
                return (
                  <li key={w.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-sm font-medium break-all">{w.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {w.rows.toLocaleString("ko-KR")}줄{auto && " · 자동으로 맞춤"}
                      </span>
                    </div>
                    <NativeSelect
                      aria-label={`${w.name} 옵션`}
                      value={value}
                      onChange={(e) => setWordChoices((c) => ({ ...c, [w.name]: e.target.value }))}
                      disabled={pending}
                    >
                      <option value={WORD_MENU}>메뉴 이름에 붙임</option>
                      <option value={WORD_IGNORE}>무시</option>
                      {options.length > 0 && (
                        <optgroup label="옵션">
                          {options.map((o) => (
                            <option key={o.id} value={`option:${o.id}`}>
                              {o.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </NativeSelect>
                  </li>
                );
              })}
            </ul>
            {options.length === 0 && (
              <p className="pt-2 text-xs text-muted-foreground">
                등록한 옵션이 없습니다. 샷 추가처럼 재료가 바뀌는 옵션은 메뉴 → 옵션에서 먼저 만들어 주세요.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {file && missingColumns.length === 0 && names.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{words.length > 0 ? 4 : 3}. 메뉴 맞추기</CardTitle>
            <CardDescription>
              파일의 메뉴 이름마다 등록한 메뉴를 골라 주세요. 쿠폰처럼 재고와 상관없는 것은 &quot;가져오지 않음&quot;.
              고른 것은 저장해 두고 다음에 자동으로 맞춥니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="divide-y">
              {names.map((n) => {
                const value = choiceOf(n.name);
                const auto = !(n.name in choices) && value !== UNSET;
                return (
                  <li key={n.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-sm font-medium break-all">{n.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {n.rows.toLocaleString("ko-KR")}줄 · {n.quantity.toLocaleString("ko-KR")}개
                        {n.refunds > 0 && ` · 취소 ${n.refunds.toLocaleString("ko-KR")}줄`}
                        {auto && " · 자동으로 맞춤"}
                      </span>
                    </div>
                    <NativeSelect
                      aria-label={`${n.name} 메뉴`}
                      value={value}
                      onChange={(e) => setChoices((c) => ({ ...c, [n.name]: e.target.value }))}
                      className={value === UNSET ? "border-destructive" : undefined}
                      disabled={pending}
                    >
                      <option value={UNSET}>메뉴 고르기…</option>
                      <option value={SKIP}>가져오지 않음</option>
                      {menus.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </li>
                );
              })}
            </ul>

            <div className="grid gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              {toImport.length > 0 ? (
                <p>
                  <span className="font-medium">
                    {toImport.length.toLocaleString("ko-KR")}줄
                    {importRefunds > 0 && ` (취소 ${importRefunds.toLocaleString("ko-KR")}줄)`} · {totalQuantity.toLocaleString("ko-KR")}개 ·{" "}
                    {won(totalAmount)}
                  </span>
                  {withOptions > 0 && (
                    <span className="text-muted-foreground"> · 옵션 붙은 줄 {withOptions.toLocaleString("ko-KR")}</span>
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    ({dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ~ ${dates.at(-1)}`})
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">가져올 판매가 없습니다.</p>
              )}
              {unmatched.length > 0 && (
                <p role="alert" className="text-destructive">
                  메뉴를 고르지 않은 이름 {unmatched.length}개가 있습니다.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={runImport} disabled={pending || unmatched.length > 0 || toImport.length === 0}>
                  {pending ? (progress ?? "가져오는 중…") : `${toImport.length.toLocaleString("ko-KR")}줄 가져오기`}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={pending}>
                  다른 파일
                </Button>
                {pending && <Badge variant="outline">창을 닫지 마세요</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
