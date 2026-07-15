// HR API utilities for managing HR suppliers and staff positions

const HR_SUPPLIERS_KEY = 'hr_suppliers';
const STAFF_POSITIONS_KEY = 'staff_positions';
const POSITION_NAMES_KEY = 'position_names';

// HR Suppliers API
export async function getAllHRSuppliers() {
  try {
    const stored = localStorage.getItem(HR_SUPPLIERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load HR suppliers:', error);
    return [];
  }
}

export async function createHRSupplier(supplier) {
  try {
    const suppliers = await getAllHRSuppliers();
    suppliers.push(supplier);
    localStorage.setItem(HR_SUPPLIERS_KEY, JSON.stringify(suppliers));
  } catch (error) {
    console.error('Failed to create HR supplier:', error);
    throw error;
  }
}

export async function updateHRSupplier(supplier) {
  try {
    const suppliers = await getAllHRSuppliers();
    const index = suppliers.findIndex(s => s.id === supplier.id);
    if (index !== -1) {
      suppliers[index] = supplier;
      localStorage.setItem(HR_SUPPLIERS_KEY, JSON.stringify(suppliers));
    }
  } catch (error) {
    console.error('Failed to update HR supplier:', error);
    throw error;
  }
}

export async function deleteHRSupplier(id) {
  try {
    const suppliers = await getAllHRSuppliers();
    const filtered = suppliers.filter(s => s.id !== id);
    localStorage.setItem(HR_SUPPLIERS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete HR supplier:', error);
    throw error;
  }
}

// Staff Positions API
export async function getAllStaffPositions() {
  try {
    const stored = localStorage.getItem(STAFF_POSITIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load staff positions:', error);
    return [];
  }
}

export async function createStaffPosition(position) {
  try {
    const positions = await getAllStaffPositions();
    positions.push(position);
    localStorage.setItem(STAFF_POSITIONS_KEY, JSON.stringify(positions));
  } catch (error) {
    console.error('Failed to create staff position:', error);
    throw error;
  }
}

export async function updateStaffPosition(position) {
  try {
    const positions = await getAllStaffPositions();
    const index = positions.findIndex(p => p.id === position.id);
    if (index !== -1) {
      positions[index] = position;
      localStorage.setItem(STAFF_POSITIONS_KEY, JSON.stringify(positions));
    }
  } catch (error) {
    console.error('Failed to update staff position:', error);
    throw error;
  }
}

export async function deleteStaffPosition(id) {
  try {
    const positions = await getAllStaffPositions();
    const filtered = positions.filter(p => p.id !== id);
    localStorage.setItem(STAFF_POSITIONS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete staff position:', error);
    throw error;
  }
}

// Position Names API
export async function getAllPositionNames() {
  try {
    const stored = localStorage.getItem(POSITION_NAMES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load position names:', error);
    return [];
  }
}

export async function createPositionName(positionName) {
  try {
    const positionNames = await getAllPositionNames();
    positionNames.push(positionName);
    localStorage.setItem(POSITION_NAMES_KEY, JSON.stringify(positionNames));
  } catch (error) {
    console.error('Failed to create position name:', error);
    throw error;
  }
}

export async function deletePositionName(id) {
  try {
    const positionNames = await getAllPositionNames();
    const filtered = positionNames.filter(p => p.id !== id);
    localStorage.setItem(POSITION_NAMES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete position name:', error);
    throw error;
  }
}