import { useState, useCallback } from "react";

/**
 * Hook to manage BonoBot chat logic
 */
export function useBonoBot() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { id: 1, role: "bot", text: "¡Hola! Soy BonoBot 🤖. ¿En qué puedo ayudarte hoy?" }
    ]);
    const [isTyping, setIsTyping] = useState(false);

    const toggleChat = () => setIsOpen(prev => !prev);

    const sendMessage = useCallback(async (text) => {
        if (!text.trim()) return;

        // 1. Add User Message
        const userMsg = { id: Date.now(), role: "user", text };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        // 2. Simulate AI Delay (Phase 1 Mock)
        setTimeout(() => {
            let botResponse = "Entendido. Como soy una versión de prueba, aún no estoy conectado a una IA real, pero pronto podré responder eso basándome en tus datos.";

            // Simple Keyword Matching for "Demo" feel
            const lower = text.toLowerCase();
            if (lower.includes("calcula") || lower.includes("cálculo")) {
                botResponse = "El bono se calcula basándose en 70% Objetivos y 30% Competencias. ¿Querés ver tu detalle actual?";
            } else if (lower.includes("fecha") || lower.includes("cierra")) {
                botResponse = "El periodo actual (Q1) cierra el 30 de Noviembre. ¡No olvides cargar tus avances!";
            } else if (lower.includes("hola")) {
                botResponse = "¡Hola! ¿Cómo estás? Preguntame lo que quieras sobre tu evaluación.";
            }

            setMessages(prev => [...prev, { id: Date.now() + 1, role: "bot", text: botResponse }]);
            setIsTyping(false);
        }, 1500);

    }, []);

    return {
        isOpen,
        toggleChat,
        messages,
        sendMessage,
        isTyping
    };
}
