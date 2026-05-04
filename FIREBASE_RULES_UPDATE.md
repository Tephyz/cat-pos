rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helper functions ──────────────────────────────────────────────────────
    function isAuthenticated() {
      return request.auth != null;
    }

    function getRole() {
      return request.auth.token.role;
    }

    function isAdmin() {
      return isAuthenticated() && getRole() == 'admin';
    }

    function isManagerOrAbove() {
      return isAuthenticated() && getRole() in ['admin', 'manager'];
    }

    function isStaffOrAbove() {
      return isAuthenticated() && getRole() in ['admin', 'manager', 'staff'];
    }

    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    // ── Users collection ──────────────────────────────────────────────────────
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isAdmin();
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if false; // Never hard-delete users
    }

    // ── Inventory collection ──────────────────────────────────────────────────
    match /inventory/{itemId} {
      allow read: if true; // Temporarily allow all reads for testing
      allow create: if isManagerOrAbove();
      allow update: if isAuthenticated(); // Staff can adjust stock via backend
      allow delete: if false;             // Soft delete only (via backend)
    }

    // ── Inventory logs (audit trail) ──────────────────────────────────────────
    match /inventoryLogs/{logId} {
      allow read: if isManagerOrAbove();
      allow create: if isAuthenticated();  // Backend writes logs
      allow update, delete: if false;     // Logs are immutable
    }

    // ── Orders collection ──────────────────────────────────────────────────────
    match /orders/{orderId} {
      allow read: if isAuthenticated();  // Any authenticated user can read orders (temporary)
      allow create: if isAuthenticated();  // Any authenticated user can create orders (temporary)
      allow update: if isManagerOrAbove(); // Only managers/admins can modify orders (for refunds)
      allow delete: if false;             // Never delete orders, use status field
    }

    // ── Shifts collection ──────────────────────────────────────────────────────
    match /shifts/{shiftId} {
      allow read: if isStaffOrAbove();
      allow create: if isManagerOrAbove();  // Managers create shifts
      allow update: if isManagerOrAbove();  // Managers update shift data
      allow delete: if false;               // Never delete shifts
    }

    // ── Menu management collections ───────────────────────────────────────────
    match /menu/{menuId} {
      allow read: if isStaffOrAbove();
      allow create: if isManagerOrAbove();
      allow update: if isManagerOrAbove();
      allow delete: if false;  // Soft delete only
    }

    match /categories/{categoryId} {
      allow read: if isStaffOrAbove();
      allow create: if isManagerOrAbove();
      allow update: if isManagerOrAbove();
      allow delete: if false;  // Soft delete only
    }

    // ── Products collection (for dynamic menu items) ───────────────────────────
    match /products/{productId} {
      allow read: if isStaffOrAbove();
      allow create: if isManagerOrAbove();
      allow update: if isManagerOrAbove();
      allow delete: if false;  // Soft delete only
    }

    // ── Settings collection ────────────────────────────────────────────────────
    match /settings/{settingId} {
      allow read: if isStaffOrAbove();
      allow create: if isAdmin();
      allow update: if isManagerOrAbove();
      allow delete: if isAdmin();
    }

    // ── Reports collection ────────────────────────────────────────────────────
    match /reports/{reportId} {
      allow read: if isManagerOrAbove();
      allow create: if isManagerOrAbove();
      allow update: if isManagerOrAbove();
      allow delete: if isManagerOrAbove();
    }
  }
}
