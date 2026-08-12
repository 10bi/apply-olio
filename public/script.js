const applicationForm = document.querySelector("form");
const submitButton = applicationForm.querySelector('button[type="submit"]');

const messageElement = document.createElement("div");
messageElement.className = "form-message";

applicationForm.appendChild(messageElement);

applicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!applicationForm.checkValidity()) {
        applicationForm.reportValidity();
        return;
    }

    const formData = new FormData(applicationForm);

    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    messageElement.className = "form-message";
    messageElement.textContent = "";

    try {
        const response = await fetch("/apply", {
            method: "POST",
            body: formData,
        });

        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
            let errorMessage = "Unable to submit your application.";

            if (contentType.includes("application/json")) {
                const data = await response.json();
                errorMessage = data.message || errorMessage;
            } else {
                const text = await response.text();

                if (text) {
                    errorMessage = text;
                }
            }

            throw new Error(errorMessage);
        }

        let result = null;

        if (contentType.includes("application/json")) {
            result = await response.json();
        }

        messageElement.className = "form-message success";
        messageElement.textContent =
            result?.message ||
            "Your application has been submitted successfully.";

        applicationForm.reset();

        window.scrollTo({
            top: applicationForm.offsetTop,
            behavior: "smooth",
        });
    } catch (error) {
        console.error("Application submission failed:", error);

        messageElement.className = "form-message error";
        messageElement.textContent =
            error.message || "Something went wrong. Please try again.";
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
});