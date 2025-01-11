import { useCallback, useState } from "react";
import { Database } from "sql.js";
import Editor from '@monaco-editor/react';
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

interface SqlQueryToolProps {
  db: Database;
}

interface RowData {
  [key: string]: string | number | null;
}

interface ColumnDef {
  headerName: string;
  field: string;
  sortable: boolean;
  filter: boolean;
}

function SqlQueryTool(props: SqlQueryToolProps) {
  const { db } = props;
  const [query, setQuery] = useState("SELECT\n" +
      "    strftime('%Y-%m', d.DateCreated) AS \"Month\",\n" +
      "    e.FirstName || ' ' || e.LastName AS \"Employee\",\n" +
      "    SUM(CASE WHEN d.Type = 'Estimate' THEN 1 ELSE 0 END) AS \"Estimate\",\n" +
      "    SUM(CASE WHEN d.Type = 'Contract' THEN 1 ELSE 0 END) AS \"Contract\",\n" +
      "    CASE \n" +
      "        WHEN SUM(CASE WHEN d.Type = 'Contract' THEN 1 ELSE 0 END) = 0 THEN 0\n" +
      "        ELSE ROUND(\n" +
      "            CAST(SUM(CASE WHEN d.Type = 'Estimate' THEN 1 ELSE 0 END) AS FLOAT) / \n" +
      "            SUM(CASE WHEN d.Type = 'Contract' THEN 1 ELSE 0 END) * 100, 2\n" +
      "        )\n" +
      "    END AS \"ConversionRate\"\n" +
      "FROM\n" +
      "    Documents d\n" +
      "JOIN\n" +
      "    Employees e ON d.ResponsibleEmployee = e.ID\n" +
      "GROUP BY\n" +
      "    strftime('%Y-%m', d.DateCreated),\n" +
      "    e.FirstName,\n" +
      "    e.LastName\n" +
      "ORDER BY\n" +
      "    \"Month\", \"Employee\";");
  const [error, setError] = useState<string>("");
  const [rowData, setRowData] = useState<RowData[]>([]);
  const [columnDefs, setColumnDefs] = useState<ColumnDef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const executeQuery = useCallback(() => {
    setIsLoading(true);
    setError("");
    try {
      console.log("Executing query:", query);
      const queryResults = db.exec(query);

      if (queryResults.length > 0) {
        console.log("Query Results:", queryResults);
        const columns: ColumnDef[] = queryResults[0].columns.map((col) => ({
          headerName: col,
          field: col,
          sortable: true,
          filter: true,
          headerClass: 'text-center',
        }));

        const rows: RowData[] = queryResults[0].values.map((row) => {
          const rowObject: RowData = {};
          queryResults[0].columns.forEach((col, index) => {
            const value = row[index];
            if (value instanceof Uint8Array) {
              rowObject[col] = new TextDecoder().decode(value);
            } else {
              rowObject[col] = value as string | number | null;
            }
          });
          return rowObject;
        });

        setColumnDefs(columns);
        setRowData(rows);
        setHistory((prevHistory) => [...prevHistory.slice(-4), query]); // Limit history to last 5 queries
      } else {
        setColumnDefs([]);
        setRowData([]);
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(`An error occurred: ${error.message}`);
        console.error("Error executing query:", error);
      } else {
        setError("An unknown error occurred");
        console.error("Unknown error executing query:", error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [db, query]);

  const loadExampleQuery = (example: string) => {
    setQuery(example);
  };

  const exportToCSV = () => {
    const csvContent = [
      columnDefs.map((col) => col.headerName).join(","),
      ...rowData.map((row) =>
        columnDefs.map((col) => JSON.stringify(row[col.field] || "")).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "query_results.csv");
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(rowData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, "query_results.xlsx");
  };

  const exportToJSON = () => {
    const jsonContent = JSON.stringify(rowData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    saveAs(blob, "query_results.json");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <div className="grid grid-cols-2 gap-6 w-full p-8">
        <div className="flex flex-col gap-6 justify-start items-start bg-gray-800 shadow-lg rounded-lg p-8">
          <h1 className="text-2xl font-semibold mb-4">SQL Query tool</h1>
          <div className="w-full">
            <Editor
                value={query}
                onChange={(text) => setQuery(text || "")}
                width="100%"
                height="300px"
                defaultLanguage="sql"
                className="border rounded-lg shadow-sm bg-gray-800 border-gray-700 text-gray-200"
            />
          </div>
          {isLoading && <div className="text-blue-400 font-medium">Executing query...</div>}
          {error.length > 0 && <div className="text-red-400 font-medium text-lg">{error}</div>}
          <button
              className="bg-gradient-to-r from-blue-500 to-blue-700 text-white px-6 py-3 rounded-lg shadow-lg hover:from-blue-600 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
              onClick={executeQuery}
          >
            Execute Query
          </button>

          <div className="mt-6">
            <h2 className="text-2xl font-semibold mb-2">Example Queries</h2>
            <div className="flex gap-2">
              <button
                  className="bg-gray-700 text-gray-200 px-4 py-2 rounded shadow hover:bg-gray-600"
                  onClick={() => loadExampleQuery("SELECT * FROM documents;")}
              >
                Select All
              </button>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-2xl font-semibold mb-2">Query History</h2>
            <ul className="list-disc list-inside">
              {history.map((query, index) => (
                  <li key={index} className="truncate">
                    {query.length > 30 ? query.substring(0, 30) + '...' : query}
                  </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-gray-800 shadow-lg rounded-lg p-8 ag-theme-alpine-dark w-full h-auto">
          <h2 className="text-2xl font-semibold mb-4">Query Results</h2>
          {rowData.length > 0 && columnDefs.length > 0 ? (
            <>
              <div className="flex gap-4 mb-4">
                <button
                  className="bg-green-500 text-white px-4 py-2 rounded shadow hover:bg-green-600"
                  onClick={exportToCSV}
                >
                  Export to CSV
                </button>
                <button
                  className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600"
                  onClick={exportToExcel}
                >
                  Export to Excel
                </button>
                <button
                  className="bg-yellow-500 text-white px-4 py-2 rounded shadow hover:bg-yellow-600"
                  onClick={exportToJSON}
                >
                  Export to JSON
                </button>
              </div>
              <AgGridReact
                modules={[ClientSideRowModelModule]}
                rowData={rowData}
                columnDefs={columnDefs}
                pagination={true}
                paginationPageSize={10}
                domLayout="autoHeight"
                defaultColDef={{ filter: true, headerClass: 'text-center' }}
                className="rounded-lg border border-gray-700"
                overlayNoRowsTemplate="<span class='text-gray-500'>No data available</span>"
                rowStyle={{
                  borderBottom: '1px solid #3B3B3B',
                }}
                rowClassRules={{
                  'bg-gray-700': 'true',
                  'hover:bg-gray-600 cursor-pointer': 'true',
                }}
              />
            </>
          ) : (
            <div className="text-gray-400 text-center text-xl">No data to display</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SqlQueryTool;