require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const { Pool } = require("pg");
const { v2: cloudinary } = require("cloudinary");

const app = express();
const port = Number(process.env.PORT) || 3000;

/*
|--------------------------------------------------------------------------
| Database
|--------------------------------------------------------------------------
*/

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});

/*
|--------------------------------------------------------------------------
| Cloudinary
|--------------------------------------------------------------------------
*/

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/*
|--------------------------------------------------------------------------
| Multer
|--------------------------------------------------------------------------
*/

const allowedImageTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const allowedCvTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 2,
    },

    fileFilter: (req, file, callback) => {
        if (file.fieldname === "profileImage") {
            if (!allowedImageTypes.has(file.mimetype)) {
                return callback(
                    new Error(
                        "Profile image must be JPG, PNG, or WebP."
                    )
                );
            }

            return callback(null, true);
        }

        if (file.fieldname === "cv") {
            if (!allowedCvTypes.has(file.mimetype)) {
                return callback(
                    new Error(
                        "CV must be a PDF, DOC, or DOCX file."
                    )
                );
            }

            return callback(null, true);
        }

        callback(new Error(`Unexpected file field: ${file.fieldname}`));
    },
});

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

/*
|--------------------------------------------------------------------------
| Basic Validation Helpers
|--------------------------------------------------------------------------
*/

function cleanString(value) {
    if (typeof value !== "string") {
        return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/*
|--------------------------------------------------------------------------
| Cloudinary Upload Helper
|--------------------------------------------------------------------------
*/

function uploadToCloudinary(buffer, folder, resourceType) {
    return new Promise((resolve, reject) => {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            reject(new Error("Cannot upload an empty file."));
            return;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result);
            }
        );

        uploadStream.end(buffer);
    });
}

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

/*
|--------------------------------------------------------------------------
| Job Application
|--------------------------------------------------------------------------
*/

app.post(
    "/apply",
    upload.fields([
        {
            name: "profileImage",
            maxCount: 1,
        },
        {
            name: "cv",
            maxCount: 1,
        },
    ]),
    async (req, res) => {
        let client = null;

        const uploadedCloudinaryFiles = [];

        try {
            /*
            |--------------------------------------------------------------------------
            | Request Data
            |--------------------------------------------------------------------------
            */

            const fullName = cleanString(req.body.fullName);
            const email = cleanString(req.body.email);
            const phone = cleanString(req.body.phone);
            const location = cleanString(req.body.location);

            const job = cleanString(req.body.job);
            const experience = cleanString(req.body.experience);
            const employmentType = cleanString(req.body.employmentType);
            const availability = cleanString(req.body.availability);

            const skills = cleanString(req.body.skills);
            const bio = cleanString(req.body.bio);
            const education = cleanString(req.body.education);

            const portfolio = cleanString(req.body.portfolio);
            const linkedin = cleanString(req.body.linkedin);
            const github = cleanString(req.body.github);
            const website = cleanString(req.body.website);

            const salary = cleanString(req.body.salary);
            const workPreference = cleanString(req.body.workPreference);
            const coverLetter = cleanString(req.body.coverLetter);

            const consent = req.body.consent;

            /*
            |--------------------------------------------------------------------------
            | Required Field Validation
            |--------------------------------------------------------------------------
            */

            if (
                !fullName ||
                !email ||
                !phone ||
                !job ||
                !experience ||
                !skills
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete all required fields.",
                });
            }

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid email address.",
                });
            }

            if (consent !== "yes") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please confirm that the information provided is accurate.",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Uploaded Files
            |--------------------------------------------------------------------------
            */

            const profileImageFile = req.files?.profileImage?.[0] || null;
            const cvFile = req.files?.cv?.[0] || null;

            /*
            |--------------------------------------------------------------------------
            | CV Validation
            |--------------------------------------------------------------------------
            */

            if (!cvFile) {
                return res.status(400).json({
                    success: false,
                    message: "CV / Resume is required.",
                });
            }

            if (
                !Buffer.isBuffer(cvFile.buffer) ||
                cvFile.buffer.length === 0 ||
                cvFile.size === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "The uploaded CV is empty or invalid.",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Profile Image Validation
            |--------------------------------------------------------------------------
            */

            if (profileImageFile) {
                if (
                    !Buffer.isBuffer(profileImageFile.buffer) ||
                    profileImageFile.buffer.length === 0 ||
                    profileImageFile.size === 0
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "The uploaded profile image is empty or invalid.",
                    });
                }
            }

            /*
            |--------------------------------------------------------------------------
            | Debug Information
            |--------------------------------------------------------------------------
            */

            console.log("========== APPLICATION FILES ==========");

            console.log("CV:", {
                name: cvFile.originalname,
                type: cvFile.mimetype,
                size: cvFile.size,
                bufferLength: cvFile.buffer.length,
            });

            console.log(
                "Profile Image:",
                profileImageFile
                    ? {
                          name: profileImageFile.originalname,
                          type: profileImageFile.mimetype,
                          size: profileImageFile.size,
                          bufferLength: profileImageFile.buffer.length,
                      }
                    : null
            );

            console.log("=======================================");

            /*
            |--------------------------------------------------------------------------
            | Upload Profile Image
            |--------------------------------------------------------------------------
            */

            let profileImageUrl = null;

            if (profileImageFile) {
                const imageResult = await uploadToCloudinary(
                    profileImageFile.buffer,
                    "olio/applicants/profile-images",
                    "image"
                );

                profileImageUrl = imageResult.secure_url;

                uploadedCloudinaryFiles.push({
                    publicId: imageResult.public_id,
                    resourceType: "image",
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Upload CV
            |--------------------------------------------------------------------------
            */

            const cvResult = await uploadToCloudinary(
                cvFile.buffer,
                "olio/applicants/cv",
                "raw"
            );

            const cvUrl = cvResult.secure_url;

            uploadedCloudinaryFiles.push({
                publicId: cvResult.public_id,
                resourceType: "raw",
            });

            /*
            |--------------------------------------------------------------------------
            | Database Connection
            |--------------------------------------------------------------------------
            */

            client = await pool.connect();

            await client.query("BEGIN");

            /*
            |--------------------------------------------------------------------------
            | Insert Application
            |--------------------------------------------------------------------------
            */

            const query = `
                INSERT INTO job_applications (
                    full_name,
                    email,
                    phone,
                    location,
                    job,
                    experience,
                    employment_type,
                    availability,
                    skills,
                    bio,
                    education,
                    portfolio,
                    linkedin,
                    github,
                    website,
                    profile_image_url,
                    cv_url,
                    expected_salary,
                    work_preference,
                    cover_letter,
                    consent
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, $20, $21
                )
                RETURNING id, created_at
            `;

            const values = [
                fullName,
                email,
                phone,
                location,

                job,
                experience,
                employmentType,
                availability,

                skills,
                bio,
                education,

                portfolio,
                linkedin,
                github,
                website,

                profileImageUrl,
                cvUrl,

                salary,
                workPreference,
                coverLetter,

                true,
            ];

            const result = await client.query(query, values);

            await client.query("COMMIT");

            const application = result.rows[0];

            console.log(
                `Application submitted successfully. ID: ${application.id}`
            );

            /*
            |--------------------------------------------------------------------------
            | JSON Response
            |--------------------------------------------------------------------------
            */

            return res.status(201).json({
                success: true,
                message:
                    "Your application has been submitted successfully.",
                applicationId: application.id,
            });
        } catch (error) {
            /*
            |--------------------------------------------------------------------------
            | Rollback Database
            |--------------------------------------------------------------------------
            */

            if (client) {
                try {
                    await client.query("ROLLBACK");
                } catch (rollbackError) {
                    console.error(
                        "Database rollback failed:",
                        rollbackError
                    );
                }
            }

            /*
            |--------------------------------------------------------------------------
            | Cleanup Cloudinary Files
            |--------------------------------------------------------------------------
            */

            if (uploadedCloudinaryFiles.length > 0) {
                for (const file of uploadedCloudinaryFiles) {
                    try {
                        await cloudinary.uploader.destroy(
                            file.publicId,
                            {
                                resource_type: file.resourceType,
                            }
                        );
                    } catch (cleanupError) {
                        console.error(
                            "Cloudinary cleanup failed:",
                            cleanupError
                        );
                    }
                }
            }

            /*
            |--------------------------------------------------------------------------
            | Error Logging
            |--------------------------------------------------------------------------
            */

            console.error("Application submission failed:", {
                message: error.message,
                name: error.name,
                code: error.code,
                http_code: error.http_code,
                stack: error.stack,
            });

            /*
            |--------------------------------------------------------------------------
            | Multer Errors
            |--------------------------------------------------------------------------
            */

            if (error instanceof multer.MulterError) {
                if (error.code === "LIMIT_FILE_SIZE") {
                    return res.status(400).json({
                        success: false,
                        message:
                            "File is too large. Maximum allowed size is 10 MB.",
                    });
                }

                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }

            /*
            |--------------------------------------------------------------------------
            | Generic Error
            |--------------------------------------------------------------------------
            */

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Something went wrong while submitting your application.",
            });
        } finally {
            if (client) {
                client.release();
            }
        }
    }
);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            success: true,
            server: "running",
            database: "connected",
        });
    } catch (error) {
        console.error("Health check failed:", error);

        res.status(500).json({
            success: false,
            server: "running",
            database: "disconnected",
        });
    }
});

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found.",
    });
});

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
    console.error("Unhandled server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        message: "Internal server error.",
    });
});

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

app.listen(port, () => {
    console.log(`Olio.my server running on port ${port}`);
});