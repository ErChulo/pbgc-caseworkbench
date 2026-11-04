/**
 * Dictionary browser — search the full derived field dictionary.
 *
 * Read-only reference data: 1,172 table-field records across 12 tables, with
 * the source classification preserved. Records the source left untagged show as
 * "Unspecified" rather than being guessed into Input or Calculated.
 */

import { useMemo, useState } from "react";
import type { DictionaryIndex } from "../../domain/catalog/types";
import { Panel, StatusPill } from "../../ui/components";

type Props = {
  index: DictionaryIndex;
};

const PAGE = 60;

export function CatalogBrowser({ index }: Props) {
  const [query, setQuery] = useState("");
  const [table, setTable] = useState("all");
  const [classification, setClassification] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const tables = useMemo(
    () => [...new Set(index.fields.map((field) => field.table))].sort(),
    [index.fields],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return index.fields.filter((field) => {
      if (table !== "all" && field.table !== table) return false;
      if (classification !== "all" && field.classification !== classification) return false;
      if (needle === "") return true;
      return (
        field.fieldName.toLowerCase().includes(needle) ||
        field.description.toLowerCase().includes(needle) ||
        field.table.toLowerCase().includes(needle)
      );
    });
  }, [classification, index.fields, query, table]);

  const visible = matches.slice(0, limit);
  const counts = index.source.classificationCounts;

  return (
    <Panel
      id="dictionary-browser"
      eyebrow="Reference"
      title="Field dictionary"
      description={`${index.fields.length.toLocaleString()} table-field records across ${index.source.tableCount} tables, derived from the authoritative workbook and versioned as ${index.version}.`}
      aside={<StatusPill tone="info">v{index.version}</StatusPill>}
    >
      <div className="filter-bar">
        <label className="inline-field grow">
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="Field name, table, or description"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <label className="inline-field">
          <span>Table</span>
          <select
            value={table}
            onChange={(event) => {
              setTable(event.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="all">All tables</option>
            {tables.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>Classification</span>
          <select
            value={classification}
            onChange={(event) => {
              setClassification(event.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="all">All</option>
            {Object.keys(counts).map((name) => (
              <option key={name} value={name}>
                {name} ({counts[name]})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="result-count" role="status">
        {matches.length.toLocaleString()} matching field
        {matches.length === 1 ? "" : "s"}
        {matches.length > visible.length ? ` · showing first ${visible.length}` : ""}
      </p>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Table</th>
              <th scope="col">Type</th>
              <th scope="col">Size</th>
              <th scope="col">Class</th>
              <th scope="col">Row</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((field) => (
              <tr key={field.fieldId}>
                <th scope="row" className="field-name-cell">
                  <span className="mono">{field.fieldName}</span>
                  <span className="field-desc">{field.description}</span>
                </th>
                <td>{field.table}</td>
                <td>{field.dataType}</td>
                <td>{field.fieldSize === "N/A" ? "—" : field.fieldSize}</td>
                <td>
                  <span
                    className={
                      field.classification === "Unspecified"
                        ? "class-tag unspecified"
                        : "class-tag"
                    }
                  >
                    {field.classification}
                  </span>
                </td>
                <td className="numeric">{field.sourceRow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matches.length > visible.length ? (
        <div className="button-row">
          <button
            className="secondary"
            type="button"
            onClick={() => setLimit((current) => current + PAGE)}
          >
            Show {Math.min(PAGE, matches.length - visible.length)} more
          </button>
        </div>
      ) : null}

      {matches.length === 0 ? (
        <p className="result-count">
          No field matches that filter. Clear the search or choose another table.
        </p>
      ) : null}
    </Panel>
  );
}
