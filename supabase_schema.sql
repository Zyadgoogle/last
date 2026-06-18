-- SKIN-E CLINICAL DATABASE SCHEMA
-- Run this in your Supabase SQL Editor

-- 1. PROFILES TABLE
-- Extends the auth.users data with clinical-specific attributes
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    name text,
    email text,
    role text default 'user',
    bio text,
    phone text,
    avatar_url text,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. ANALYSIS HISTORY TABLE
create table if not exists public.analysis_history (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users on delete cascade not null,
    date timestamp with time zone default timezone('utc'::text, now()) not null,
    type text not null,
    result text not null,
    score integer not null
);

-- 3. ACTIVITIES TABLE (Audit Trail)
create table if not exists public.activities (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users on delete cascade not null,
    type text not null,
    title text not null,
    description text not null,
    icon text not null,
    date timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS POLICIES (Row Level Security)
alter table public.profiles enable row level security;
alter table public.analysis_history enable row level security;
alter table public.activities enable row level security;

-- NOTE: We use auth.jwt() -> 'user_metadata' to check roles. 
-- This avoids infinite recursion in the profiles table.

-- Profile Policies: Users can view their own profile; Admins see all.
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Admins can view all profiles" on public.profiles for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- History Policies
drop policy if exists "Users can view own history" on public.analysis_history;
drop policy if exists "Users can insert own history" on public.analysis_history;
drop policy if exists "Admins can view all history" on public.analysis_history;

create policy "Users can view own history" on public.analysis_history for select using (auth.uid() = user_id);
create policy "Users can insert own history" on public.analysis_history for insert with check (auth.uid() = user_id);
create policy "Admins can view all history" on public.analysis_history for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Activity Policies
drop policy if exists "Users can view own activities" on public.activities;
drop policy if exists "Users can insert own activities" on public.activities;
drop policy if exists "Admins can view all activities" on public.activities;

create policy "Users can view own activities" on public.activities for select using (auth.uid() = user_id);
create policy "Users can insert own activities" on public.activities for insert with check (auth.uid() = user_id);
create policy "Admins can view all activities" on public.activities for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Pharmacist policies for profiles
create policy "Pharmacists can view all profiles" on public.profiles for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'pharmacist'
);

-- Pharmacist policies for analysis history
create policy "Pharmacists can view all history" on public.analysis_history for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'pharmacist'
);
-- Allow users to see pharmacist profiles (so they can see who answered their consultation)
create policy "Users can view pharmacist profiles" on public.profiles for select using (role = 'pharmacist');

-- 4. CONSULTATIONS TABLE (Ask a Specialist)
create table if not exists public.consultations (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users on delete cascade not null,
    pharmacist_id uuid references auth.users on delete cascade,
    question text not null,
    answer text,
    status text default 'pending', -- 'pending' or 'answered'
    image_url text, -- Base64 or URL for the attached skin photo
    messages jsonb default '[]'::jsonb, -- Array of chat messages [{sender: 'user'|'pharmacist', text: string, created_at: string}]
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    answered_at timestamp with time zone
);

-- Support migration for existing tables:
alter table public.consultations add column if not exists image_url text;
alter table public.consultations add column if not exists messages jsonb default '[]'::jsonb;

alter table public.consultations enable row level security;

-- Users can view their own consultations
create policy "Users can view own consultations" on public.consultations for select using (auth.uid() = user_id);

-- Users can insert their own consultations
create policy "Users can insert own consultations" on public.consultations for insert with check (auth.uid() = user_id);

-- Pharmacists can view all consultations
create policy "Pharmacists can view all consultations" on public.consultations for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'pharmacist'
);

-- Pharmacists can update consultations (to answer them)
create policy "Pharmacists can update consultations" on public.consultations for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'pharmacist'
);

-- Admins can view all consultations
create policy "Admins can view all consultations" on public.consultations for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- 5. PRODUCTS TABLE (E-Commerce)
create table if not exists public.products (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    description text,
    price numeric(10, 2) not null,
    image_url text,
    category text, -- E.g., 'Oily', 'Dry', 'Acne' to filter by skin condition
    created_by uuid references auth.users on delete set null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.products enable row level security;

-- Everyone can view products
create policy "Anyone can view products" on public.products for select using (true);

-- Only Admins and Pharmacists can insert/update/delete products
create policy "Admins and Pharmacists can insert products" on public.products for insert with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'pharmacist')
);
create policy "Admins and Pharmacists can update products" on public.products for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'pharmacist')
);
create policy "Admins and Pharmacists can delete products" on public.products for delete using (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'pharmacist')
);

-- 6. ORDERS TABLE
create table if not exists public.orders (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users on delete cascade not null,
    product_id uuid references public.products on delete cascade not null,
    status text default 'pending', -- 'pending', 'paid', 'delivered'
    payment_method text not null, -- 'cod', 'vodafone_cash', 'instapay'
    address text not null,
    phone text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.orders enable row level security;

-- Users can view their own orders
create policy "Users can view own orders" on public.orders for select using (auth.uid() = user_id);

-- Users can insert their own orders
create policy "Users can insert own orders" on public.orders for insert with check (auth.uid() = user_id);

-- Admins and Pharmacists can view all orders
create policy "Admins and Pharmacists can view all orders" on public.orders for select using (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'pharmacist')
);

-- Admins and Pharmacists can update order status
create policy "Admins and Pharmacists can update orders" on public.orders for update using (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'pharmacist')
);

-- Note: To upload product images, ensure a storage bucket named "products" is created and public.
insert into storage.buckets (id, name, public) values ('products', 'products', true) on conflict do nothing;

create policy "Anyone can view product images" on storage.objects for select using ( bucket_id = 'products' );
create policy "Admins and Pharmacists can upload product images" on storage.objects for insert with check (
  bucket_id = 'products' and (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'pharmacist')
);

