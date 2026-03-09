"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [form, setForm] = useState({
    fullname: "",
    usercode: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    
    setForm({ ...form, [name]: value });

  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    console.log("Signup data:", form);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-5xl bg-white shadow-xl rounded-2xl grid grid-cols-1 md:grid-cols-2 overflow-hidden">
        {/* LEFT SIDE - LOGO */}
        <div className="hidden md:flex items-center justify-center bg-black p-10">
          <Image
            src="/2nd.jpg"
            alt="Coffee and Tea Connection Logo"
            width={300}
            height={300}
            className="rounded-xl"
          />
        </div>

        {/* RIGHT SIDE - SIGNUP FORM */}
        <div className="p-10">
          <h1 className="text-3xl font-bold mb-6 text-gray-800">Create Account</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              name="fullname"
              placeholder="Full Name"
              value={form.fullname}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              required
            />

            <input
              type="text"
              name="usercode"
              placeholder="User Code"
              value={form.usercode}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              required
            />


            <input
              type="password"
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              required
            />

            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={form.confirmPassword}
              onChange={handleChange}
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black"
              required
            />

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              className="w-full bg-black text-white py-2 rounded-lg font-semibold hover:bg-gray-900 transition"
            >
              Sign Up
            </button>
          </form>

          <p className="text-sm text-gray-500 mt-4">
           Already have an account?{" "}
<Link href="/" className="underline">
  Login
</Link>

          </p>
        </div>
      </div>
    </div>
  );
}
