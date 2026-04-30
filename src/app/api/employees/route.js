import { NextResponse } from 'next/server';
import oracledb from 'oracledb';
import { requireCompany, unauthorized, serverError } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET(req) {
  try {
    const cid = await requireCompany();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const dept   = searchParams.get('dept')   || '';
    const status = searchParams.get('status') || '';

    let sql = `SELECT * FROM vw_employees WHERE company_id = :cid`;
    const binds = { cid };

    if (search) {
      sql += ` AND (LOWER(full_name) LIKE :s OR LOWER(email) LIKE :s)`;
      binds.s = `%${search.toLowerCase()}%`;
    }
    if (dept)   { sql += ` AND dept_id = :dept`;   binds.dept   = dept;   }
    if (status) { sql += ` AND status  = :status`; binds.status = status; }
    
    sql += ` ORDER BY emp_id`;

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

    const {
      first_name, last_name, email, phone, hire_date, job_title, dept_id,
      basic_salary, hra, da, ta, medical, pf_percent, tax_percent,
    } = body;

    if (!first_name || !last_name || !email || !hire_date || !basic_salary) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    // Check duplicate email within company
    const dup = await queryOne(
      `SELECT emp_id FROM employees WHERE company_id = :cid AND LOWER(email) = LOWER(:email)`,
      { cid, email }
    );
    if (dup) {
      return NextResponse.json({ error: 'Employee with this email already exists' }, { status: 409 });
    }

    // Insert employee and salary structure atomically using a PL/SQL block
    const plsql = `
      DECLARE
        v_emp_id employees.emp_id%TYPE;
      BEGIN
        -- 1. Insert Employee
        INSERT INTO employees
          (company_id, dept_id, first_name, last_name, email, phone, hire_date, job_title, status)
        VALUES
          (:cid, :dept_id, :fn, :ln, :email, :phone, TO_DATE(:hire_date, 'YYYY-MM-DD'), :jt, 'ACTIVE')
        RETURNING emp_id INTO v_emp_id;

        -- 2. Insert Salary Structure
        INSERT INTO salary_structures
          (company_id, emp_id, basic_salary, hra, da, ta, medical, pf_percent, tax_percent, effective_from, is_current)
        VALUES
          (:cid, v_emp_id, :bs, :hra, :da, :ta, :med, :pf, :tax, SYSDATE, 1);

        -- 3. Return the generated employee ID to Node.js
        :out_emp_id := v_emp_id;
      END;
    `;

    const binds = {
      cid,
      dept_id: dept_id || null,
      fn: first_name,
      ln: last_name,
      email,
      phone: phone || null,
      hire_date,
      jt: job_title || null,
      bs: parseFloat(basic_salary) || 0,
      hra: parseFloat(hra) || 0,
      da: parseFloat(da) || 0,
      ta: parseFloat(ta) || 0,
      med: parseFloat(medical) || 0,
      pf: parseFloat(pf_percent) || 12,
      tax: parseFloat(tax_percent) || 10,
      out_emp_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    };

    const empRes = await query(plsql, binds);
    const emp_id = empRes.outBinds.out_emp_id;

    return NextResponse.json({ message: 'Employee added successfully', emp_id }, { status: 201 });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    
    // Catch potential date parsing errors from Oracle (e.g., ORA-01861)
    if (e.message && e.message.includes('ORA-01861')) {
        return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD.' }, { status: 400 });
    }

    return serverError(e);
  }
}