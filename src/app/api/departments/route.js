import { NextResponse } from 'next/server';
import { requireCompany, unauthorized, serverError } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET(req) {
  try {
    const cid = await requireCompany();
    const result = await query(
      `SELECT d.dept_id, d.dept_name, d.location,
              m.first_name || ' ' || m.last_name AS manager_name,
              COUNT(e.emp_id) AS employee_count,
              NVL(SUM(ss.basic_salary + ss.hra + ss.da + ss.ta + ss.medical), 0) AS total_payroll
       FROM departments d
       LEFT JOIN employees m  ON m.emp_id = d.manager_id
       LEFT JOIN employees e  ON e.dept_id = d.dept_id AND e.status = 'ACTIVE'
       LEFT JOIN salary_structures ss ON ss.emp_id = e.emp_id AND ss.is_current = 1
       WHERE d.company_id = :cid
       GROUP BY d.dept_id, d.dept_name, d.location, m.first_name, m.last_name
       ORDER BY d.dept_id`,
      { cid }
    );
    return NextResponse.json({ data: result.rows });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    return serverError(e);
  }
}

export async function POST(req) {
  try {
    const cid = await requireCompany();
    
    // 1. Safely parse JSON body
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }

    const { dept_name, location, manager_id } = body;
    
    if (!dept_name || dept_name.trim() === '') {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 });
    }

    // 2. Check for duplicate department name within the company
    const dup = await queryOne(
      `SELECT dept_id FROM departments WHERE company_id = :cid AND LOWER(dept_name) = LOWER(:name)`,
      { cid, name: dept_name }
    );
    
    if (dup) {
      return NextResponse.json({ error: 'A department with this name already exists' }, { status: 409 });
    }

    await query(
      `INSERT INTO departments (company_id, dept_name, location, manager_id)
       VALUES (:cid, :name, :loc, :mgr)`,
      { cid, name: dept_name, loc: location || null, mgr: manager_id || null }
    );
    
    return NextResponse.json({ message: 'Department created successfully' }, { status: 201 });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    return serverError(e);
  }
}

export async function DELETE(req) {
  try {
    const cid = await requireCompany();
    
    // 1. Prioritize URL Search Params for standard REST implementation
    const { searchParams } = new URL(req.url);
    let dept_id = searchParams.get('id') || searchParams.get('dept_id');

    // 2. Fallback to parsing JSON body (for frontend backwards-compatibility)
    if (!dept_id) {
      try {
        const body = await req.json();
        dept_id = body.dept_id;
      } catch (err) {
        // Silently fail if no JSON body exists, we will catch the missing ID below
      }
    }

    if (!dept_id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });
    }

    // 3. Pre-check for employees to prevent messy SQL constraint errors
    const empCheck = await queryOne(
      `SELECT COUNT(emp_id) AS emp_count FROM employees WHERE dept_id = :did AND company_id = :cid`,
      { did: dept_id, cid }
    );
    
    // Depending on your DB driver, aliases might be returned as uppercase (EMP_COUNT) or lowercase (emp_count)
    const activeEmployees = empCheck?.emp_count || empCheck?.EMP_COUNT || 0;
    
    if (activeEmployees > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete department because there are employees currently assigned to it.' 
      }, { status: 409 });
    }

    // 4. Perform Deletion
    await query(
      `DELETE FROM departments WHERE dept_id = :did AND company_id = :cid`,
      { did: dept_id, cid }
    );
    
    return NextResponse.json({ message: 'Department deleted successfully' });
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return unauthorized();
    
    // Fallback error catch for Oracle Child Record Found (ORA-02292)
    if (e.message && e.message.includes('ORA-02292')) {
      return NextResponse.json({ error: 'Cannot delete: dependent records exist.' }, { status: 409 });
    }
    
    return serverError(e);
  }
}