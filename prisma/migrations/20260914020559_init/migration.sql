-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin', 'head_admin');

-- CreateEnum
CREATE TYPE "PartCategory" AS ENUM ('CPU', 'GPU', 'MOTHERBOARD', 'RAM', 'PSU', 'CASE', 'SSD', 'COOLER');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('PREBUILT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('VERIFICATION', 'PARTS_SOURCED', 'BUILDING', 'HANDED_TO_CARGO', 'DELIVERED_PAID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "isHeadAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceMkd" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "cpuLabel" TEXT NOT NULL DEFAULT '',
    "coolerLabel" TEXT NOT NULL DEFAULT '',
    "motherboardLabel" TEXT NOT NULL DEFAULT '',
    "ramLabel" TEXT NOT NULL DEFAULT '',
    "gpuLabel" TEXT NOT NULL DEFAULT '',
    "ssdLabel" TEXT NOT NULL DEFAULT '',
    "psuLabel" TEXT NOT NULL DEFAULT '',
    "caseLabel" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" "PartCategory" NOT NULL,
    "priceMkd" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "socket" TEXT,
    "ramType" TEXT,
    "wattage" INTEGER,
    "tdpWatts" INTEGER,
    "pcieSlots" INTEGER,
    "formFactor" TEXT,
    "includesCooler" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prebuilt" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cpuLabel" TEXT NOT NULL,
    "coolerLabel" TEXT NOT NULL DEFAULT '',
    "motherboardLabel" TEXT NOT NULL DEFAULT '',
    "ramLabel" TEXT NOT NULL,
    "gpuLabel" TEXT NOT NULL,
    "ssdLabel" TEXT NOT NULL,
    "psuLabel" TEXT NOT NULL DEFAULT '',
    "caseLabel" TEXT NOT NULL DEFAULT '',
    "priceMkd" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "deliveryHours" INTEGER NOT NULL DEFAULT 24,
    "imageUrl" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'new',
    "conditionGrade" TEXT NOT NULL DEFAULT '',
    "featured" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prebuilt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "cargoCode" TEXT,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'VERIFICATION',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Скопје',
    "partsCostMkd" INTEGER NOT NULL,
    "assemblyFeeMkd" INTEGER NOT NULL DEFAULT 0,
    "selfBuild" BOOLEAN NOT NULL DEFAULT false,
    "totalMkd" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "userId" TEXT,
    "prebuiltId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partId" TEXT,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceMkd" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "assemblyFeeMkd" INTEGER NOT NULL DEFAULT 2500,
    "currency" TEXT NOT NULL DEFAULT 'MKD',
    "companyName" TEXT NOT NULL DEFAULT 'AXON.MK',
    "supportPhone" TEXT NOT NULL DEFAULT '+389 70 000 000',
    "supportViber" TEXT NOT NULL DEFAULT '+389 70 000 000',

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserListing_status_createdAt_idx" ON "UserListing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserListing_sellerId_idx" ON "UserListing"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Prebuilt_slug_key" ON "Prebuilt"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingCode_key" ON "Order"("trackingCode");

-- AddForeignKey
ALTER TABLE "UserListing" ADD CONSTRAINT "UserListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_prebuiltId_fkey" FOREIGN KEY ("prebuiltId") REFERENCES "Prebuilt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
