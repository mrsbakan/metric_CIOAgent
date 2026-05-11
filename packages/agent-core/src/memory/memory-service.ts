import type { Db } from "@cio-agent/db";
import {
  withRls,
  getAllUserMemory,
  upsertUserMemory,
  getAllRoleMemory,
  upsertRoleMemory,
} from "@cio-agent/db";
import { encryptMemory, decryptMemory } from "./crypto.js";

export interface IMemoryService {
  loadAllUserMemory(tenantId: string, userId: string): Promise<Record<string, string>>;
  loadAllRoleMemory(tenantId: string, roleId: string): Promise<Record<string, string>>;
  writeUserMemory(tenantId: string, userId: string, key: string, value: string): Promise<void>;
  writeRoleMemory(tenantId: string, roleId: string, key: string, value: string): Promise<void>;
}

export class MemoryService implements IMemoryService {
  constructor(
    private readonly db:            Db,
    private readonly encryptionKey: Buffer,  // 32-byte AES-256 key, pre-fetched from Vault
  ) {}

  async loadAllUserMemory(tenantId: string, userId: string): Promise<Record<string, string>> {
    const rows = await withRls(this.db, tenantId, (tx) => getAllUserMemory(tx, userId));
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = decryptMemory(row.value, this.encryptionKey);
    }
    return result;
  }

  async loadAllRoleMemory(tenantId: string, roleId: string): Promise<Record<string, string>> {
    const rows = await withRls(this.db, tenantId, (tx) => getAllRoleMemory(tx, roleId));
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = decryptMemory(row.value, this.encryptionKey);
    }
    return result;
  }

  async writeUserMemory(
    tenantId: string,
    userId:   string,
    key:      string,
    value:    string,
  ): Promise<void> {
    const ciphertext = encryptMemory(value, this.encryptionKey);
    await withRls(this.db, tenantId, (tx) =>
      upsertUserMemory(tx, { tenant_id: tenantId, user_id: userId, key, value: ciphertext }),
    );
  }

  async writeRoleMemory(
    tenantId: string,
    roleId:   string,
    key:      string,
    value:    string,
  ): Promise<void> {
    const ciphertext = encryptMemory(value, this.encryptionKey);
    await withRls(this.db, tenantId, (tx) =>
      upsertRoleMemory(tx, { tenant_id: tenantId, role_id: roleId, key, value: ciphertext }),
    );
  }
}
