import { NextResponse } from 'next/server';
import { requireCompany, unauthorized, serverError } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req) {
  try {
    const cid = await requireCompany();
    const { searchParams } = new URL(req.url);
    
    // Ensure month and year are explicitly integers for Oracle EXTRACT
    const month = parseInt(searchParams.get('month')) || new Date().getMonth() + 1;
    const year  = parseInt(searchParams.get('year'))  || new Date().getFullYear();
    const emp   = searchParams.get('emp');

    let sql = `
      SELECT a.att_id, a.att_date, a.status,
             e.emp_id, e.first_name || ' ' || e.last_name AS full_name,
             e.job_title, d.dept_name
      FROM attendance a
      JOIN employees e ON e.emp_id = a.emp_id
      LEFT JOIN departments d ON d.dept_id = e.dept_id
      WHERE a.company_id = :cid
        AND EXTRACT(MONTH FROM a.att_date) = :month
        AND EXTRACT(YEAR FROM a.att_date) = :year
    `;
    
    const binds = { cid, month, year };
    
    if (emp) { 
      sql += ` AND a.emp_id = :emp`; 
      binds.emp = emp; 
    }
    
    sql += ` ORDER BY a.att_date DESC, full_name`;

    const result = await query(sql, binds);
    return NextResponse.json({ data: result.rows });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    return serverError(e);
  }
}

export async function POST(req) {
  try {
    const cid = await requireCompany();
    
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }

    const { emp_id, att_date, status } = body;
    
    if (!emp_id || !att_date) {
      return NextResponse.json({ error: 'emp_id and att_date are required' }, { status: 400 });
    }

    await query(
      `MERGE INTO attendance a
       USING DUAL ON (a.company_id = :cid AND a.emp_id = :eid AND a.att_date = TO_DATE(:dt, 'YYYY-MM-DD'))
       WHEN MATCHED THEN UPDATE SET a.status = :status
       WHEN NOT MATCHED THEN INSERT (company_id, emp_id, att_date, status)
            VALUES (:cid, :eid, TO_DATE(:dt, 'YYYY-MM-DD'), :status)`,
      { cid, eid: emp_id, dt: att_date, status: status || 'PRESENT' }
    );
    
    return NextResponse.json({ message: 'Attendance saved successfully' });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    
    if (e.message && e.message.includes('ORA-01861')) {
      return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD.' }, { status: 400 });
    }
    return serverError(e);
  }
}

// Bulk mark attendance for a date (OPTIMIZED FOR BATCH EXECUTION)
export async function PUT(req) {
  try {
    const cid = await requireCompany();
    
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }

    const { records } = body; 
    
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No valid records provided' }, { status: 400 });
    }

    let savedCount = 0;
    
    // 1. Initialize the PL/SQL block and base binds
    let plsql = `BEGIN\n`;
    const binds = { cid };

    // 2. Dynamically build the MERGE queries and bind variables
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r.emp_id || !r.att_date) continue; // Skip malformed rows safely
      
      plsql += `
        MERGE INTO attendance a
        USING DUAL ON (a.company_id = :cid AND a.emp_id = :eid${i} AND a.att_date = TO_DATE(:dt${i}, 'YYYY-MM-DD'))
        WHEN MATCHED THEN UPDATE SET a.status = :status${i}
        WHEN NOT MATCHED THEN INSERT (company_id, emp_id, att_date, status)
             VALUES (:cid, :eid${i}, TO_DATE(:dt${i}, 'YYYY-MM-DD'), :status${i});
      `;
      
      // Assign dynamic keys to prevent collision (e.g., :eid0, :eid1, :eid2)
      binds[`eid${i}`] = r.emp_id;
      binds[`dt${i}`] = r.att_date;
      binds[`status${i}`] = r.status || 'PRESENT';
      
      savedCount++;
    }
    
    // 3. Close the PL/SQL block
    plsql += `END;`;

    // 4. Execute the entire batch in a single database round-trip
    if (savedCount > 0) {
      await query(plsql, binds);
    }
    
    return NextResponse.json({ message: `${savedCount} records saved successfully` });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    
    if (e.message && e.message.includes('ORA-01861')) {
      return NextResponse.json({ error: 'Invalid date format found in batch.' }, { status: 400 });
    }
    
    return serverError(e);
  }
}