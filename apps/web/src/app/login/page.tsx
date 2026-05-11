"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

const schema = z.object({
  tenant_id: z.string().uuid("Must be a valid UUID"),
  email:     z.string().email("Invalid email"),
  password:  z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof schema>;

interface LoginResponse {
  access_token:  string;
  refresh_token: string;
  user_id:       string;
  tenant_id:     string;
}

export default function LoginPage() {
  const router   = useRouter();
  const setTokens = useAuth((s) => s.setTokens);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      const res = await api.post<LoginResponse>("/v1/auth/login", values);
      setTokens(res.access_token, res.refresh_token, res.user_id, res.tenant_id);
      router.replace("/chat");
    } catch (err) {
      setError("root", { message: err instanceof Error ? err.message : "Login failed" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">CIO Agent</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Tenant ID" error={errors.tenant_id?.message}>
            <input
              {...register("tenant_id")}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={inputCls(!!errors.tenant_id)}
            />
          </Field>

          <Field label="Email" error={errors.email?.message}>
            <input
              {...register("email")}
              type="email"
              placeholder="you@company.com"
              className={inputCls(!!errors.email)}
            />
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <input
              {...register("password")}
              type="password"
              placeholder="••••••••"
              className={inputCls(!!errors.password)}
            />
          </Field>

          {errors.root && (
            <p className="text-sm text-red-600 text-center">{errors.root.message}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-brand text-white rounded-lg font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand",
    hasError ? "border-red-400" : "border-gray-300",
  );
}
